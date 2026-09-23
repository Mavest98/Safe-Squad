const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const Database = require('better-sqlite3');

const fs = require('node:fs');
const PORT = Number(process.env.API_PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'safe-squad-local-development-secret-change-me';
const dataDirectory = path.join(__dirname, 'data');
fs.mkdirSync(dataDirectory, { recursive: true });
const database = new Database(path.join(dataDirectory, 'safe-squad.sqlite'));
const mailTransport = process.env.SMTP_HOST
  ? nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === 'true', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } })
  : null;

database.pragma('foreign_keys = ON');
database.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    password_hash TEXT NOT NULL,
    medical_conditions TEXT,
    blood_type TEXT,
    allergies TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS squads (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    venue TEXT NOT NULL DEFAULT 'Choose a venue',
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS squad_members (
    squad_id TEXT NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    checked_in INTEGER NOT NULL DEFAULT 0,
    joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (squad_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    squad_id TEXT NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    accuracy REAL,
    recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    squad_id TEXT NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS trips (
    id TEXT PRIMARY KEY,
    squad_id TEXT NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    destination TEXT NOT NULL,
    departure_time TEXT,
    eta TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'planned',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS guardian_angels (
    guardian_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    protected_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    squad_id TEXT NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (guardian_id, protected_id)
  );
  CREATE TABLE IF NOT EXISTS safe_words (
    squad_id TEXT NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    word TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (squad_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS safe_zones (
    id TEXT PRIMARY KEY,
    squad_id TEXT NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    radius REAL NOT NULL DEFAULT 200,
    added_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS incidents (
    id TEXT PRIMARY KEY,
    squad_id TEXT NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
    reported_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    description TEXT NOT NULL,
    location TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '32kb' }));

function makeToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    emergencyContactName: user.emergency_contact_name,
    emergencyContactPhone: user.emergency_contact_phone,
    createdAt: user.created_at,
  };
}

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: 'Authentication required.' });
  }
}

function validateUserDetails(body) {
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (name.length < 2) return 'Enter your full name.';
  if (!/^\S+@\S+\.\S+$/.test(email)) return 'Enter a valid email address.';
  if (password.length < 8) return 'Password must be at least 8 characters.';
  return null;
}

function getUser(id) {
  return database.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function getSquadForUser(userId) {
  return database.prepare(`
    SELECT s.id, s.name, s.venue, s.created_at, sm.role
    FROM squads s JOIN squad_members sm ON sm.squad_id = s.id
    WHERE sm.user_id = ? ORDER BY s.created_at DESC LIMIT 1
  `).get(userId);
}

function squadPayload(squad, userId) {
  if (!squad) return null;
  const members = database.prepare(`
    SELECT u.id, u.name, u.email, u.phone, sm.role, sm.checked_in,
      (SELECT latitude FROM locations l WHERE l.user_id = u.id AND l.squad_id = sm.squad_id ORDER BY l.recorded_at DESC LIMIT 1) AS latitude,
      (SELECT longitude FROM locations l WHERE l.user_id = u.id AND l.squad_id = sm.squad_id ORDER BY l.recorded_at DESC LIMIT 1) AS longitude,
      (SELECT recorded_at FROM locations l WHERE l.user_id = u.id AND l.squad_id = sm.squad_id ORDER BY l.recorded_at DESC LIMIT 1) AS locationUpdatedAt
    FROM squad_members sm JOIN users u ON u.id = sm.user_id WHERE sm.squad_id = ?
  `).all(squad.id);
  const alerts = database.prepare('SELECT id, user_id, type, message, status, created_at FROM alerts WHERE squad_id = ? ORDER BY created_at DESC LIMIT 20').all(squad.id);
  const trip = database.prepare(`SELECT id, title, destination, departure_time, eta, notes, status, created_at, updated_at FROM trips WHERE squad_id = ? AND user_id = ? AND status = 'planned' ORDER BY updated_at DESC LIMIT 1`).get(squad.id, userId) || null;
  return { ...squad, isOwner: squad.role === 'owner', members, alerts, trip, currentUserId: userId };
}

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'safe-squad-api' }));

app.post('/api/auth/register', (req, res) => {
  const validationError = validateUserDetails(req.body);
  if (validationError) return res.status(400).json({ message: validationError });
  const name = String(req.body.name).trim();
  const email = String(req.body.email).trim().toLowerCase();
  const passwordHash = bcrypt.hashSync(req.body.password, 12);
  const id = crypto.randomUUID();
  try {
    database.prepare(`INSERT INTO users (id, name, email, phone, emergency_contact_name, emergency_contact_phone, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(id, name, email, String(req.body.phone || '').trim(), String(req.body.emergencyContactName || '').trim(), String(req.body.emergencyContactPhone || '').trim(), passwordHash);
    const user = getUser(id);
    res.status(201).json({ token: makeToken(user), user: publicUser(user) });
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) return res.status(409).json({ message: 'An account with that email already exists.' });
    res.status(500).json({ message: 'Could not create the account.' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = database.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(String(req.body.password || ''), user.password_hash)) return res.status(401).json({ message: 'Email or password is incorrect.' });
  res.json({ token: makeToken(user), user: publicUser(user) });
});

app.get('/api/auth/me', auth, (req, res) => {
  const user = getUser(req.user.sub);
  if (!user) return res.status(401).json({ message: 'Account no longer exists.' });
  res.json({ user: publicUser(user) });
});

app.patch('/api/auth/profile', auth, (req, res) => {
  const name = String(req.body.name || '').trim();
  const phone = String(req.body.phone || '').trim();
  const emergencyContactName = String(req.body.emergencyContactName || '').trim();
  const emergencyContactPhone = String(req.body.emergencyContactPhone || '').trim();
  if (name.length < 2) return res.status(400).json({ message: 'Enter your full name.' });
  database.prepare('UPDATE users SET name = ?, phone = ?, emergency_contact_name = ?, emergency_contact_phone = ? WHERE id = ?').run(name, phone, emergencyContactName, emergencyContactPhone, req.user.sub);
  res.json({ user: publicUser(getUser(req.user.sub)) });
});

app.patch('/api/auth/medical-info', auth, (req, res) => {
  const medicalConditions = String(req.body.medicalConditions || '').trim();
  const bloodType = String(req.body.bloodType || '').trim();
  const allergies = String(req.body.allergies || '').trim();
  database.prepare('UPDATE users SET medical_conditions = ?, blood_type = ?, allergies = ? WHERE id = ?').run(medicalConditions, bloodType, allergies, req.user.sub);
  res.json({ user: publicUser(getUser(req.user.sub)) });
});

app.get('/api/squad', auth, (req, res) => res.json({ squad: squadPayload(getSquadForUser(req.user.sub), req.user.sub) }));

app.post('/api/squad', auth, (req, res) => {
  const name = String(req.body.name || '').trim();
  if (name.length < 2) return res.status(400).json({ message: 'Give your squad a name.' });
  const squadId = crypto.randomUUID();
  const transaction = database.transaction(() => {
    database.prepare('INSERT INTO squads (id, name, venue, owner_id) VALUES (?, ?, ?, ?)').run(squadId, name, String(req.body.venue || 'Choose a venue'), req.user.sub);
    database.prepare('INSERT INTO squad_members (squad_id, user_id, role) VALUES (?, ?, ?)').run(squadId, req.user.sub, 'owner');
  });
  transaction();
  res.status(201).json({ squad: squadPayload(getSquadForUser(req.user.sub), req.user.sub) });
});

app.post('/api/squad/check-in', auth, (req, res) => {
  const squad = getSquadForUser(req.user.sub);
  if (!squad) return res.status(404).json({ message: 'Create a squad first.' });
  const activeTrip = database.prepare("SELECT id FROM trips WHERE squad_id = ? AND user_id = ? AND status = 'planned'").get(squad.id, req.user.sub);
  if (req.body.checkedIn && !activeTrip) return res.status(400).json({ message: 'Create a trip plan before sending a check-in pulse.' });
  const checkedIn = req.body.checkedIn ? 1 : 0;
  database.prepare('UPDATE squad_members SET checked_in = ? WHERE squad_id = ? AND user_id = ?').run(checkedIn, squad.id, req.user.sub);
  res.json({ squad: squadPayload(squad, req.user.sub) });
});

app.post('/api/squad/trip', auth, (req, res) => {
  const squad = getSquadForUser(req.user.sub);
  const title = String(req.body.title || '').trim();
  const destination = String(req.body.destination || '').trim();
  if (!squad) return res.status(404).json({ message: 'Create a squad first.' });
  if (title.length < 2 || destination.length < 2) return res.status(400).json({ message: 'Add a trip name and destination.' });
  database.prepare(`UPDATE trips SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE squad_id = ? AND user_id = ? AND status = 'planned'`).run(squad.id, req.user.sub);
  database.prepare('INSERT INTO trips (id, squad_id, user_id, title, destination, departure_time, eta, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(crypto.randomUUID(), squad.id, req.user.sub, title, destination, String(req.body.departureTime || '').trim(), String(req.body.eta || '').trim(), String(req.body.notes || '').trim());
  res.status(201).json({ squad: squadPayload(squad, req.user.sub) });
});

app.patch('/api/squad/trip', auth, (req, res) => {
  const squad = getSquadForUser(req.user.sub);
  const trip = database.prepare("SELECT id FROM trips WHERE squad_id = ? AND user_id = ? AND status = 'planned' ORDER BY updated_at DESC LIMIT 1").get(squad?.id, req.user.sub);
  if (!squad || !trip) return res.status(404).json({ message: 'No active trip to update.' });
  database.prepare('UPDATE trips SET title = ?, destination = ?, departure_time = ?, eta = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(String(req.body.title || '').trim(), String(req.body.destination || '').trim(), String(req.body.departureTime || '').trim(), String(req.body.eta || '').trim(), String(req.body.notes || '').trim(), trip.id);
  res.json({ squad: squadPayload(squad, req.user.sub) });
});

app.delete('/api/squad/trip', auth, (req, res) => {
  const squad = getSquadForUser(req.user.sub);
  if (!squad) return res.status(404).json({ message: 'Create a squad first.' });
  database.prepare("UPDATE trips SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE squad_id = ? AND user_id = ? AND status = 'planned'").run(squad.id, req.user.sub);
  database.prepare('UPDATE squad_members SET checked_in = 0 WHERE squad_id = ? AND user_id = ?').run(squad.id, req.user.sub);
  res.json({ squad: squadPayload(squad, req.user.sub) });
});

app.post('/api/squad/members', auth, (req, res) => {
  const squad = getSquadForUser(req.user.sub);
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!squad || squad.role !== 'owner') return res.status(403).json({ message: 'Only the squad owner can invite members.' });
  const member = database.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (!member) return res.status(404).json({ message: 'Register that user first, then invite them by email.' });
  try {
    database.prepare('INSERT INTO squad_members (squad_id, user_id, role) VALUES (?, ?, ?)').run(squad.id, member.id, 'member');
    res.status(201).json({ squad: squadPayload(squad, req.user.sub) });
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) return res.status(409).json({ message: 'That user is already in this squad.' });
    res.status(500).json({ message: 'Could not add that user to the squad.' });
  }
});

app.post('/api/squad/location', auth, (req, res) => {
  const squad = getSquadForUser(req.user.sub);
  const latitude = Number(req.body.latitude);
  const longitude = Number(req.body.longitude);
  if (!squad) return res.status(404).json({ message: 'Create a squad first.' });
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return res.status(400).json({ message: 'A valid location is required.' });
  database.prepare('INSERT INTO locations (squad_id, user_id, latitude, longitude, accuracy) VALUES (?, ?, ?, ?, ?)').run(squad.id, req.user.sub, latitude, longitude, Number(req.body.accuracy) || null);
  res.json({ message: 'Location shared with your squad.' });
});

app.post('/api/squad/location-notification', auth, async (req, res) => {
  const squad = getSquadForUser(req.user.sub);
  const user = getUser(req.user.sub);
  const latitude = Number(req.body.latitude);
  const longitude = Number(req.body.longitude);
  if (!squad) return res.status(404).json({ message: 'Create a squad first.' });
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return res.status(400).json({ message: 'A valid location is required.' });
  const subject = `${user.name} shared a Safe Squad location`;
  const text = `${user.name} shared their location from ${squad.venue || 'their active venue'} in the ${squad.name} squad.\n\nCoordinates: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}\nMap: https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`;
  if (!mailTransport) return res.json({ delivered: false, preview: { to: user.email, subject, text }, message: 'Email preview created. Configure SMTP_HOST to deliver it.' });
  try {
    await mailTransport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: user.email, subject, text });
    res.json({ delivered: true, message: `Location details sent to ${user.email}.` });
  } catch {
    res.status(502).json({ message: 'Location was saved, but the email provider could not deliver the notification.' });
  }
});

app.post('/api/squad/alerts', auth, (req, res) => {
  const squad = getSquadForUser(req.user.sub);
  if (!squad) return res.status(404).json({ message: 'Create a squad first.' });
  const type = String(req.body.type || 'safety');
  const message = String(req.body.message || 'A squad member requested help.').trim();
  database.prepare('INSERT INTO alerts (id, squad_id, user_id, type, message) VALUES (?, ?, ?, ?, ?)').run(crypto.randomUUID(), squad.id, req.user.sub, type, message);
  res.status(201).json({ squad: squadPayload(squad, req.user.sub) });
});

app.post('/api/squad/alerts/:id/read', auth, (req, res) => {
  const squad = getSquadForUser(req.user.sub);
  if (!squad) return res.status(404).json({ message: 'Create a squad first.' });
  database.prepare('UPDATE alerts SET status = ? WHERE id = ? AND squad_id = ?').run('read', req.params.id, squad.id);
  res.json({ squad: squadPayload(squad, req.user.sub) });
});

app.post('/api/squad/alerts/clear', auth, (req, res) => {
  const squad = getSquadForUser(req.user.sub);
  if (!squad) return res.status(404).json({ message: 'Create a squad first.' });
  database.prepare('UPDATE alerts SET status = ? WHERE squad_id = ? AND user_id = ? AND type = ?').run('resolved', squad.id, req.user.sub, 'emergency-sos');
  res.json({ squad: squadPayload(squad, req.user.sub) });
});

app.post('/api/squad/emergency-notification', auth, async (req, res) => {
  const { phone, message, location, batteryLevel } = req.body;
  if (!phone || !message) return res.status(400).json({ message: 'Phone and message are required.' });
  
  const subject = 'Safe Squad Emergency Alert';
  const text = `${message}\n\nBattery: ${batteryLevel}%\nLocation: ${location?.latitude?.toFixed(6)}, ${location?.longitude?.toFixed(6)}\nMap: https://www.openstreetmap.org/?mlat=${location?.latitude}&mlon=${location?.longitude}#map=16/${location?.latitude}/${location?.longitude}`;
  
  if (!mailTransport) {
    return res.json({ delivered: false, preview: { to: phone, subject, text }, message: 'SMS/Email preview created. Configure SMTP to deliver it.' });
  }
  
  try {
    await mailTransport.sendMail({ 
      from: process.env.SMTP_FROM || process.env.SMTP_USER, 
      to: phone, 
      subject, 
      text 
    });
    res.json({ delivered: true, message: `Emergency notification sent to ${phone}.` });
  } catch {
    res.status(502).json({ message: 'Emergency notification could not be delivered.' });
  }
});

// Messaging endpoints
app.get('/api/squad/messages', auth, (req, res) => {
  const squad = getSquadForUser(req.user.sub);
  if (!squad) return res.status(404).json({ message: 'Create a squad first.' });
  
  const messages = database.prepare(`
    SELECT m.id, m.sender_id, m.receiver_id, m.content, m.timestamp, m.read,
           u_from.name as sender_name, u_to.name as receiver_name
    FROM messages m
    JOIN users u_from ON m.sender_id = u_from.id
    JOIN users u_to ON m.receiver_id = u_to.id
    WHERE (m.sender_id = ? OR m.receiver_id = ?) AND 
          (m.sender_id IN (SELECT user_id FROM squad_members WHERE squad_id = ?) OR 
           m.receiver_id IN (SELECT user_id FROM squad_members WHERE squad_id = ?))
    ORDER BY m.timestamp DESC LIMIT 50
  `).all(req.user.sub, req.user.sub, squad.id, squad.id);
  
  const unreadCount = database.prepare(`
    SELECT COUNT(*) as count FROM messages 
    WHERE receiver_id = ? AND read = 0
  `).get(req.user.sub).count;
  
  res.json({ messages, unreadCount });
});

app.post('/api/squad/messages', auth, (req, res) => {
  const { sender_id, receiver_id, content } = req.body;
  if (!sender_id || !receiver_id || !content) return res.status(400).json({ message: 'Sender, receiver, and content are required.' });
  if (sender_id !== req.user.sub) return res.status(403).json({ message: 'Can only send messages as yourself.' });
  
  const squad = getSquadForUser(req.user.sub);
  if (!squad) return res.status(404).json({ message: 'Create a squad first.' });
  
  const messageId = crypto.randomUUID();
  database.prepare('INSERT INTO messages (id, sender_id, receiver_id, content, timestamp, read) VALUES (?, ?, ?, ?, ?, 0)').run(messageId, sender_id, receiver_id, content, new Date().toISOString());
  
  res.status(201).json({ message: 'Message sent successfully.' });
});

// Guardian Angel endpoints
app.post('/api/squad/guardian-angel', auth, (req, res) => {
  const { targetMemberId } = req.body;
  if (!targetMemberId) return res.status(400).json({ message: 'Target member ID is required.' });
  
  const squad = getSquadForUser(req.user.sub);
  if (!squad) return res.status(404).json({ message: 'Create a squad first.' });
  
  // Verify target member is in the squad
  const memberExists = database.prepare('SELECT 1 FROM squad_members WHERE squad_id = ? AND user_id = ?').get(squad.id, targetMemberId);
  if (!memberExists) return res.status(404).json({ message: 'Target member not in your squad.' });
  
  // Store guardian angel relationship
  database.prepare('INSERT OR REPLACE INTO guardian_angels (guardian_id, protected_id, squad_id, created_at) VALUES (?, ?, ?, ?)').run(req.user.sub, targetMemberId, squad.id, new Date().toISOString());
  
  res.json({ message: 'Guardian Angel mode activated.' });
});

// Safe Word endpoints
app.post('/api/squad/safe-word', auth, (req, res) => {
  const { word } = req.body;
  if (!word) return res.status(400).json({ message: 'Safe word is required.' });
  
  const squad = getSquadForUser(req.user.sub);
  if (!squad) return res.status(404).json({ message: 'Create a squad first.' });
  
  database.prepare('INSERT OR REPLACE INTO safe_words (squad_id, user_id, word, created_at) VALUES (?, ?, ?, ?)').run(squad.id, req.user.sub, word, new Date().toISOString());
  
  res.json({ message: 'Safe word set successfully.' });
});

// Safe Zones endpoints
app.get('/api/squad/safe-zones', auth, (req, res) => {
  const squad = getSquadForUser(req.user.sub);
  if (!squad) return res.status(404).json({ message: 'Create a squad first.' });
  
  const safeZones = database.prepare('SELECT * FROM safe_zones WHERE squad_id = ?').all(squad.id);
  res.json({ safeZones });
});

app.post('/api/squad/safe-zones', auth, (req, res) => {
  const { name, latitude, longitude, radius } = req.body;
  if (!latitude || !longitude) return res.status(400).json({ message: 'Latitude and longitude are required.' });
  
  const squad = getSquadForUser(req.user.sub);
  if (!squad) return res.status(404).json({ message: 'Create a squad first.' });
  
  const zoneId = crypto.randomUUID();
  database.prepare('INSERT INTO safe_zones (id, squad_id, name, latitude, longitude, radius, added_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(zoneId, squad.id, name || 'Safe Zone', latitude, longitude, radius || 200, req.user.sub, new Date().toISOString());
  
  res.status(201).json({ message: 'Safe zone added successfully.' });
});

// Incident Reporting endpoints
app.post('/api/squad/incidents', auth, (req, res) => {
  const { type, description, location } = req.body;
  if (!type || !description) return res.status(400).json({ message: 'Type and description are required.' });
  
  const squad = getSquadForUser(req.user.sub);
  if (!squad) return res.status(404).json({ message: 'Create a squad first.' });
  
  const incidentId = crypto.randomUUID();
  database.prepare('INSERT INTO incidents (id, squad_id, reported_by, type, description, location, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(incidentId, squad.id, req.user.sub, type, description, location, new Date().toISOString());
  
  // Notify squad about incident
  const alertData = {
    type: 'incident-report',
    message: `Incident reported: ${type}`,
    incidentId: incidentId,
    reportedBy: req.user.sub
  };
  
  database.prepare('INSERT INTO alerts (id, squad_id, user_id, type, message) VALUES (?, ?, ?, ?, ?)').run(crypto.randomUUID(), squad.id, req.user.sub, 'incident-report', `${type} reported by squad member`);
  
  res.status(201).json({ message: 'Incident reported successfully.' });
});

app.listen(PORT, () => console.log(`Safe Squad API listening on http://localhost:${PORT}`));
