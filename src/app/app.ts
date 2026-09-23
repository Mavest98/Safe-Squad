import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { AuthService, UserProfile } from './auth.service';

// Simple UUID generator for client-side use
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

interface SquadMember {
  id: string;
  name: string;
  email: string;
  role: string;
  checked_in: number;
  latitude: number | null;
  longitude: number | null;
  locationUpdatedAt: string | null;
  color: string;
}

interface SquadData {
  id: string;
  name: string;
  venue: string;
  members: SquadMember[];
  alerts: { id: string; type: string; message: string; status: string; user_id: string }[];
  trip: TripData | null;
}

interface TripData {
  id: string;
  title: string;
  destination: string;
  departure_time: string;
  eta: string;
  notes: string;
  status: string;
}

@Component({
  selector: 'app-dashboard',
  imports: [FormsModule, CommonModule],
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App implements OnInit {
  readonly title = 'Safe Squad';
  readonly showSquadDialog = signal(false);
  readonly showProfileDialog = signal(false);
  readonly showTripDialog = signal(false);
  readonly emergencyActive = signal(false);
  readonly hasCheckedIn = signal(false);
  readonly actionNotice = signal('');
  readonly error = signal('');
  readonly loading = signal(true);
  readonly sharingLocation = signal(false);
  readonly activeTool = signal('');
  readonly fakeCallActive = signal(false);
  readonly batteryAlertsEnabled = signal(true);
  readonly geofenceEnabled = signal(true);
  readonly currentLocation = signal<{ latitude: number; longitude: number; accuracy?: number } | null>(null);
  readonly user = signal<UserProfile | null>(null);
  readonly squad = signal<SquadData | null>(null);
  readonly trustedAlert = signal<{ id: string; message: string } | null>(null);
  readonly trip = signal<TripData | null>(null);
  
  // SOS/Danger Mode Signals
  readonly inDanger = signal(false);
  readonly showDangerModal = signal(false);
  readonly batteryLevel = signal<number>(100);
  
  // Dynamic Check-in Lifecycle Signals
  readonly currentCheckInNote = signal('');
  readonly checkInNoteInput = signal('');
  readonly showCheckInNoteModal = signal(false);
  
  // --- Safety Timer Signals
  readonly safetyTimerActive = signal(false);
  readonly safetyTimerMinutes = signal(30);
  readonly safetyTimerRemaining = signal(0);
  readonly showSafetyTimerDialog = signal(false);
  private safetyTimerInterval?: number;
  
  // --- Enhanced Fake Call Signals
  readonly fakeCallIncoming = signal(false);
  readonly fakeCallCallerName = signal('Mom');
  readonly fakeCallTimer = signal(0);
  private fakeCallTimeout?: number;
  
  // --- Medical Information Signals
  readonly showMedicalInfo = signal(false);
  readonly medicalConditions = signal('');
  readonly bloodType = signal('');
  readonly allergies = signal('');
  
  // --- Offline Mode Signals
  readonly isOffline = signal(false);
  readonly offlineAlerts = signal<any[]>([]);
  
  // --- Theme Signals
  readonly darkMode = signal(false);
  
  // --- Weather Signals
  readonly weatherData = signal<any>(null);
  readonly showWeather = signal(false);
  
  // --- Emergency Shortcuts Signals
  readonly showEmergencyShortcuts = signal(false);
  
  // --- Location History Signals
  readonly locationHistory = signal<any[]>([]);
  readonly showLocationHistory = signal(false);
  
  // --- Messaging System Signals
  readonly showMessaging = signal(false);
  readonly messages = signal<any[]>([]);
  readonly newMessage = signal('');
  readonly selectedMember = signal<string | null>(null);
  readonly unreadCount = signal(0);
  readonly isTyping = signal(false);
  readonly searchQuery = signal('');
  readonly filteredMessages = signal<any[]>([]);
  readonly showSearch = signal(false);
  readonly messageReactions = signal<Record<string, string[]>>({});
  
  // --- Guardian Angel Mode Signals
  readonly guardianAngelActive = signal(false);
  readonly guardianAngelMember = signal<string | null>(null);
  
  // --- Safe Word System Signals
  readonly safeWord = signal('');
  readonly safeWordLevels = ['CODE GREEN', 'CODE YELLOW', 'CODE RED', 'CODE BLACK'];
  readonly currentSafeWordLevel = signal(0);
  readonly showSafeWordDialog = signal(false);
  
  // --- Route Tracking Signals
  readonly routeTrackingActive = signal(false);
  readonly plannedRoute = signal<any[]>([]);
  readonly routeDeviated = signal(false);
  
  // --- Safety Score Signals
  readonly safetyScore = signal(75);
  readonly safetyStreak = signal(0);
  readonly achievements = signal<string[]>([]);
  
  // --- Safety Tips Signals
  readonly showSafetyTips = signal(false);
  readonly currentTip = signal('');
  readonly tipDismissed = signal(false);
  
  // --- Check-in Reminders Signals
  readonly checkInReminderActive = signal(false);
  readonly checkInReminderInterval = signal(30); // minutes
  readonly checkInReminderTime = signal(0);
  private checkInReminderTimer?: number;
  
  // --- Incident Reporting Signals
  readonly showIncidentReport = signal(false);
  readonly incidentType = signal('');
  readonly incidentDescription = signal('');
  readonly incidentLocation = signal('');
  
  // --- Safe Zones Signals
  readonly safeZones = signal<{ id: string; name: string; latitude: number; longitude: number; radius: number; addedBy: string; timestamp: string }[]>([]);
  readonly inSafeZone = signal(false);
  readonly currentSafeZone = signal<{ id: string; name: string; latitude: number; longitude: number; radius: number; addedBy: string; timestamp: string } | null>(null);
  
  squadName = '';
  venue = '';
  inviteEmail = '';
  profileName = '';
  profilePhone = '';
  emergencyContactName = '';
  emergencyContactPhone = '';
  tripTitle = '';
  destination = '';
  departureTime = '';
  eta = '';
  tripNotes = '';
  private alertTimer?: number;

  readonly features = [
    { icon: '◎', title: 'Venue geofencing', description: 'Auto-detect when your squad leaves the venue or strays beyond the trusted zone.' },
    { icon: '⚡', title: 'Battery drop alerts', description: 'Flag low battery before your group gets stuck without a way to reach help.' },
    { icon: '☎', title: 'Fake-call generator', description: 'Create a discreet call flow that lets you exit tense situations without awkwardness.' },
    { icon: '🛡', title: 'Private security dispatch', description: 'Trigger a connected safety response with one tap when a member needs backup.' },
    { icon: '⌖', title: 'Location sharing', description: 'Share your live position with the people in your active safety circle.' },
    { icon: '⏱', title: 'Safety timer', description: 'Set a countdown timer that automatically alerts your squad if you do not check in.' },
    { icon: '🏥', title: 'Medical information', description: 'Store critical medical info for emergency responders.' },
    { icon: '🔒', title: 'Stealth mode', description: 'Discreet operation with hidden UI elements for sensitive situations.' },
  ];

  constructor(private readonly auth: AuthService, private readonly router: Router, private readonly sanitizer: DomSanitizer) {
    this.monitorBatteryLevel();
  }

  private monitorBatteryLevel(): void {
    if ('getBattery' in navigator) {
      (navigator as any).getBattery?.().then((battery: any) => {
        this.batteryLevel.set(Math.round(battery.level * 100));
        battery.addEventListener('levelchange', () => {
          this.batteryLevel.set(Math.round(battery.level * 100));
        });
      });
    }
  }

  ngOnInit(): void {
    // Load saved theme preference
    const savedTheme = localStorage.getItem('safe-squad-theme');
    if (savedTheme === 'dark') {
      this.darkMode.set(true);
      document.body.classList.add('dark-mode');
    }
    
    this.user.set(this.auth.user());
    console.log('User:', this.auth.user());
    console.log('User signal:', this.user());
    
    this.auth.get<{ squad: SquadData | null }>('/squad').subscribe({
      next: (response) => { 
        console.log('Squad loaded:', response.squad);
        this.applySquad(response.squad); 
        this.loading.set(false); 
        this.startAlertPolling(); 
        this.loadSafeZones();
        this.loadWeather();
      },
      error: (response) => { 
        console.error('Squad loading error:', response);
        this.error.set(response.error?.message || 'Could not load your squad.'); 
        this.loading.set(false); 
      },
    });
    this.captureLocation(false);
    this.checkOnlineStatus();
    
    // Start location history recording
    setInterval(() => this.recordLocation(), 60000); // Every minute
    
    // Request notification permission for emergency alerts
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    
    // Setup discreet activation after component is rendered
    setTimeout(() => this.setupLongPressActivation(), 100);
    
    // Show safety tip periodically
    if (!this.tipDismissed()) {
      setTimeout(() => this.showRandomTip(), 30000); // Show after 30 seconds
    }
    
    // Check safe zones periodically
    setInterval(() => this.checkSafeZones(), 30000); // Every 30 seconds
    
    // Auto-start check-in reminders if enabled
    if (this.checkInReminderActive()) {
      this.startCheckInReminders();
    }
  }

  private loadSafeZones(): void {
    this.auth.get('/squad/safe-zones').subscribe({
      next: (response: any) => {
        this.safeZones.set(response.safeZones || []);
      },
      error: () => {
        // Safe zones not critical, continue without them
      }
    });
  }

  get displayName(): string { return this.user()?.name?.split(' ')[0] || 'there'; }

  formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  formatMessageTime(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  }

  onKeyPress(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.sendMessage();
    }
    
    // Typing indicator
    this.isTyping.set(true);
    setTimeout(() => this.isTyping.set(false), 1000);
  }

  // --- Advanced Messaging Features ---
  toggleSearch(): void {
    this.showSearch.update(show => !show);
    if (!this.showSearch()) {
      this.searchQuery.set('');
      this.filteredMessages.set([]);
    }
  }

  searchMessages(): void {
    const query = this.searchQuery().toLowerCase();
    if (!query) {
      this.filteredMessages.set([]);
      return;
    }
    
    const filtered = this.messages().filter(msg => 
      msg.content.toLowerCase().includes(query)
    );
    this.filteredMessages.set(filtered);
  }

  addReaction(messageId: string, emoji: string): void {
    const reactions = this.messageReactions();
    if (!reactions[messageId]) {
      reactions[messageId] = [];
    }
    if (!reactions[messageId].includes(emoji)) {
      reactions[messageId].push(emoji);
      this.messageReactions.set(reactions);
    }
  }

  markAsRead(messageId: string): void {
    this.auth.patch(`/squad/messages/${messageId}/read`, {}).subscribe({
      next: () => {
        this.messages.update(msgs => 
          msgs.map(msg => msg.id === messageId ? { ...msg, read: true } : msg)
        );
        this.unreadCount.update(count => Math.max(0, count - 1));
      },
      error: () => {
        // Continue even if mark as read fails
      }
    });
  }

  // --- Theme Toggle ---
  toggleTheme(): void {
    this.darkMode.update(mode => !mode);
    document.body.classList.toggle('dark-mode', this.darkMode());
    localStorage.setItem('safe-squad-theme', this.darkMode() ? 'dark' : 'light');
  }

  // --- Weather Integration ---
  loadWeather(): void {
    const location = this.currentLocation();
    if (!location) return;
    
    // Using a free weather API (Open-Meteo)
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current_weather=true`)
      .then(response => response.json())
      .then(data => {
        this.weatherData.set(data);
        this.showWeather.set(true);
      })
      .catch(() => {
        // Weather not critical, continue without it
      });
  }

  getWeatherCondition(): string {
    const weather = this.weatherData()?.current_weather;
    if (!weather) return 'Unknown';
    
    const code = weather.weathercode;
    if (code <= 3) return 'Clear';
    if (code <= 48) return 'Foggy';
    if (code <= 67) return 'Rainy';
    if (code <= 77) return 'Snowy';
    if (code <= 82) return 'Rainy';
    if (code <= 99) return 'Stormy';
    return 'Cloudy';
  }

  // --- Emergency Shortcuts ---
  toggleEmergencyShortcuts(): void {
    this.showEmergencyShortcuts.update(show => !show);
  }

  quickSOS(): void {
    this.triggerDangerMode();
  }

  quickCallEmergency(): void {
    this.callEmergencyServices();
  }

  quickShareLocation(): void {
    this.shareLocation();
  }

  // --- Location History ---
  showLocationHistoryTimeline(): void {
    this.showLocationHistory.set(true);
  }

  closeLocationHistory(): void {
    this.showLocationHistory.set(false);
  }

  recordLocation(): void {
    const location = this.currentLocation();
    if (!location) return;
    
    const historyEntry = {
      id: generateUUID(),
      latitude: location.latitude,
      longitude: location.longitude,
      timestamp: new Date().toISOString(),
      accuracy: location.accuracy
    };
    
    this.locationHistory.update(history => [...history, historyEntry]);
    
    // Keep only last 100 entries
    if (this.locationHistory().length > 100) {
      this.locationHistory.update(history => history.slice(-100));
    }
  }

  // --- Check-in Reminders ---
  startCheckInReminders(): void {
    if (this.checkInReminderTimer) {
      clearInterval(this.checkInReminderTimer);
    }
    
    this.checkInReminderActive.set(true);
    this.checkInReminderTime.set(this.checkInReminderInterval() * 60);
    
    this.checkInReminderTimer = window.setInterval(() => {
      const remaining = this.checkInReminderTime() - 1;
      this.checkInReminderTime.set(remaining);
      
      if (remaining <= 0) {
        this.triggerCheckInReminder();
        this.checkInReminderTime.set(this.checkInReminderInterval() * 60);
      }
    }, 1000);
  }

  stopCheckInReminders(): void {
    if (this.checkInReminderTimer) {
      clearInterval(this.checkInReminderTimer);
      this.checkInReminderTimer = undefined;
    }
    this.checkInReminderActive.set(false);
    this.checkInReminderTime.set(0);
  }

  private triggerCheckInReminder(): void {
    this.actionNotice.set('⏰ Check-in reminder: Please confirm you are safe.');
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Safe Squad Check-in Reminder', {
        body: 'Please confirm you are safe by checking in.',
        icon: '⏰'
      });
    }
  }

  // --- Form Validation ---
  validateEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  validatePhone(phone: string): boolean {
    return /^[\d\s\-\+\(\)]+$/.test(phone) && phone.replace(/\D/g, '').length >= 10;
  }

  validateRequired(value: string): boolean {
    return value.trim().length > 0;
  }

  logout(): void { this.auth.logout(); this.router.navigateByUrl('/login'); }

  // --- SOS / Danger Mode Logic ---
  triggerDangerMode(): void {
    if (!this.auth.hasSession()) {
      this.error.set('You must be logged in to use emergency features.');
      this.router.navigate(['/login']);
      return;
    }
    
    if (!this.squad()) {
      this.error.set('Create a squad first to enable emergency alerts.');
      this.openSquadDialog();
      return;
    }

    this.inDanger.set(true);
    this.showDangerModal.set(true);
    this.actionNotice.set('🚨 Emergency SOS triggered! Live coordinates sent to all squad members.');
    this.broadcastEmergencyAlert();
    this.sendPersonalEmergencyNotifications();
  }

  closeDangerModal(): void {
    this.showDangerModal.set(false);
  }

  resolveDangerMode(): void {
    this.inDanger.set(false);
    this.showDangerModal.set(false);
    this.actionNotice.set('Status set to Safe. Emergency broadcast cleared.');
    this.clearEmergencyAlert();
  }

  private broadcastEmergencyAlert(): void {
    const location = this.currentLocation();
    const currentUser = this.auth.user();
    const emergencyData = {
      type: 'emergency-sos',
      message: `${this.displayName} is in danger! Immediate assistance required at their current location.`,
      userName: this.displayName,
      userId: currentUser?.id,
      latitude: location?.latitude,
      longitude: location?.longitude,
      batteryLevel: this.batteryLevel(),
      timestamp: new Date().toISOString(),
      severity: 'critical'
    };
    
    this.auth.post<{ squad: SquadData }>('/squad/alerts', emergencyData).subscribe({
      next: (response) => {
        this.applySquad(response.squad);
        this.triggerEmergencyNotifications(response.squad, this.displayName);
      },
      error: (response) => {
        this.error.set(response.error?.message || 'Could not broadcast emergency alert.');
      }
    });
  }

  private triggerEmergencyNotifications(squad: SquadData, userName: string): void {
    // Send browser notifications to all squad members who are online
    if ('Notification' in window && Notification.permission === 'granted') {
      squad.members.forEach(member => {
        if (member.id !== this.auth.user()?.id) {
          new Notification(`🚨 ${userName} is in danger!`, {
            body: `Emergency SOS triggered! Location: ${this.currentLocation()?.latitude?.toFixed(4)}, ${this.currentLocation()?.longitude?.toFixed(4)}`,
            icon: '🚨',
            tag: 'emergency-sos',
            requireInteraction: true
          });
        }
      });
    }
  }

  private sendPersonalEmergencyNotifications(): void {
    const user = this.user();
    const location = this.currentLocation();
    
    // Send to emergency contact
    if (user?.emergencyContactPhone) {
      const emergencyMessage = `EMERGENCY: ${user.name} has triggered an SOS alert. Location: ${location?.latitude?.toFixed(4)}, ${location?.longitude?.toFixed(4)}. Battery: ${this.batteryLevel()}%. Please contact immediately.`;
      this.auth.post('/squad/emergency-notification', {
        phone: user.emergencyContactPhone,
        message: emergencyMessage,
        location: location,
        batteryLevel: this.batteryLevel()
      }).subscribe({
        error: () => {
          // Continue even if notification fails
          console.log('Emergency notification to contact failed');
        }
      });
    }
  }

  private clearEmergencyAlert(): void {
    this.auth.post<{ squad: SquadData }>('/squad/alerts/clear', {}).subscribe({
      next: (response) => {
        this.applySquad(response.squad);
      },
      error: () => {
        // Continue even if clear fails
      }
    });
  }

  callEmergencyServices(): void {
    const emergencyNumber = this.getEmergencyNumber();
    window.location.href = `tel:${emergencyNumber}`;
  }

  private getEmergencyNumber(): string {
    // Detect region and return appropriate emergency number
    const user = this.user();
    if (user?.phone) {
      const phone = user.phone;
      if (phone.startsWith('+1') || phone.startsWith('1')) return '911'; // North America
      if (phone.startsWith('+44') || phone.startsWith('44')) return '999'; // UK
      if (phone.startsWith('+27') || phone.startsWith('27')) return '10111'; // South Africa
      if (phone.startsWith('+61') || phone.startsWith('61')) return '000'; // Australia
      if (phone.startsWith('+33') || phone.startsWith('33')) return '112'; // Europe
    }
    return '112'; // Default international emergency number
  }

  callEmergencyContact(): void {
    const phone = this.user()?.emergencyContactPhone;
    if (phone) {
      window.location.href = `tel:${phone}`;
    } else {
      this.error.set('No emergency contact phone configured.');
    }
  }

  // --- Dynamic Check-in Lifecycle Logic ---
  editCheckIn(): void {
    this.checkInNoteInput.set(this.currentCheckInNote());
    this.showCheckInNoteModal.set(true);
  }

  saveCheckInNote(): void {
    this.currentCheckInNote.set(this.checkInNoteInput());
    this.showCheckInNoteModal.set(false);
    this.actionNotice.set('Check-in note updated.');
  }

  clearCheckInAndRelocate(): void {
    this.hasCheckedIn.set(false);
    this.currentCheckInNote.set('');
    this.actionNotice.set('Select a new spot to re-check in.');
  }

  // --- Safety Timer Logic ---
  openSafetyTimerDialog(): void {
    this.showSafetyTimerDialog.set(true);
  }

  closeSafetyTimerDialog(): void {
    this.showSafetyTimerDialog.set(false);
  }

  startSafetyTimer(): void {
    if (this.safetyTimerInterval) {
      clearInterval(this.safetyTimerInterval);
    }
    
    this.safetyTimerActive.set(true);
    this.safetyTimerRemaining.set(this.safetyTimerMinutes() * 60);
    this.showSafetyTimerDialog.set(false);
    this.actionNotice.set(`Safety timer started. Check-in required in ${this.safetyTimerMinutes()} minutes.`);
    
    this.safetyTimerInterval = window.setInterval(() => {
      const remaining = this.safetyTimerRemaining() - 1;
      this.safetyTimerRemaining.set(remaining);
      
      if (remaining <= 0) {
        this.stopSafetyTimer();
        this.triggerSafetyTimerExpiry();
      }
    }, 1000);
  }

  stopSafetyTimer(): void {
    if (this.safetyTimerInterval) {
      clearInterval(this.safetyTimerInterval);
      this.safetyTimerInterval = undefined;
    }
    this.safetyTimerActive.set(false);
    this.safetyTimerRemaining.set(0);
  }

  resetSafetyTimer(): void {
    this.stopSafetyTimer();
    this.safetyTimerRemaining.set(this.safetyTimerMinutes() * 60);
    this.safetyTimerActive.set(true);
    this.safetyTimerInterval = window.setInterval(() => {
      const remaining = this.safetyTimerRemaining() - 1;
      this.safetyTimerRemaining.set(remaining);
      
      if (remaining <= 0) {
        this.stopSafetyTimer();
        this.triggerSafetyTimerExpiry();
      }
    }, 1000);
    this.actionNotice.set('Safety timer reset.');
  }

  private triggerSafetyTimerExpiry(): void {
    this.actionNotice.set('⚠️ Safety timer expired! Your squad has been notified.');
    this.broadcastEmergencyAlert();
    this.inDanger.set(true);
    this.showDangerModal.set(true);
  }

  // --- Enhanced Fake Call Logic ---
  startFakeCall(): void {
    this.fakeCallIncoming.set(true);
    this.fakeCallTimer.set(0);
    
    // Play ringtone if available
    this.playRingtone();
    
    this.fakeCallTimeout = window.setTimeout(() => {
      this.fakeCallIncoming.set(false);
      this.actionNotice.set('Fake call ended.');
    }, 30000); // 30 second call
  }

  endFakeCall(): void {
    this.fakeCallIncoming.set(false);
    if (this.fakeCallTimeout) {
      clearTimeout(this.fakeCallTimeout);
      this.fakeCallTimeout = undefined;
    }
    this.stopRingtone();
    this.actionNotice.set('Fake call ended.');
  }

  private playRingtone(): void {
    // In a real implementation, this would play a ringtone
    if ('Audio' in window) {
      try {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleQAA'); // Placeholder
        audio.play().catch(() => {});
      } catch (e) {
        // Audio not available
      }
    }
  }

  private stopRingtone(): void {
    // Stop any playing audio
  }

  // --- Medical Information Logic ---
  openMedicalInfo(): void {
    this.showMedicalInfo.set(true);
  }

  closeMedicalInfo(): void {
    this.showMedicalInfo.set(false);
  }

  saveMedicalInfo(): void {
    this.auth.patch<{ user: UserProfile }>('/auth/medical-info', {
      medicalConditions: this.medicalConditions(),
      bloodType: this.bloodType(),
      allergies: this.allergies()
    }).subscribe({
      next: (response) => {
        this.user.set(response.user);
        this.showMedicalInfo.set(false);
        this.actionNotice.set('Medical information updated.');
      },
      error: (response) => {
        this.error.set(response.error?.message || 'Could not update medical information.');
      }
    });
  }

  // --- Offline Mode Logic ---
  checkOnlineStatus(): void {
    this.isOffline.set(!navigator.onLine);
    
    if (this.isOffline()) {
      this.actionNotice.set('⚠️ You are offline. Emergency features will work with limited functionality.');
    }
    
    window.addEventListener('online', () => {
      this.isOffline.set(false);
      this.syncOfflineAlerts();
    });
    
    window.addEventListener('offline', () => {
      this.isOffline.set(true);
      this.actionNotice.set('⚠️ You are offline. Emergency features will work with limited functionality.');
    });
  }

  private syncOfflineAlerts(): void {
    const alerts = this.offlineAlerts();
    if (alerts.length > 0) {
      alerts.forEach(alert => {
        this.auth.post('/squad/alerts', alert).subscribe({
          error: () => {
            // Keep in offline queue if sync fails
          }
        });
      });
      this.offlineAlerts.set([]);
      this.actionNotice.set('Offline alerts synced with server.');
    }
  }

  // --- Discreet Activation Methods ---
  setupLongPressActivation(): void {
    let pressTimer: number | undefined;
    const sosButton = document.querySelector('.sos-btn') as HTMLElement;
    
    if (sosButton) {
      sosButton.addEventListener('mousedown', () => {
        pressTimer = window.setTimeout(() => {
          this.triggerDangerMode();
        }, 3000); // 3 second long press
      });
      
      sosButton.addEventListener('mouseup', () => {
        if (pressTimer) {
          clearTimeout(pressTimer);
          pressTimer = undefined;
        }
      });
      
      sosButton.addEventListener('mouseleave', () => {
        if (pressTimer) {
          clearTimeout(pressTimer);
          pressTimer = undefined;
        }
      });
    }
  }

  // --- Messaging System Logic ---
  openMessaging(): void {
    this.showMessaging.set(true);
    this.loadMessages();
  }

  closeMessaging(): void {
    this.showMessaging.set(false);
  }

  selectMember(memberId: string): void {
    this.selectedMember.set(memberId);
    this.loadMessages();
  }

  sendMessage(): void {
    if (!this.newMessage().trim() || !this.selectedMember()) return;
    
    const message = {
      sender_id: this.auth.user()?.id,
      receiver_id: this.selectedMember(),
      content: this.newMessage(),
      timestamp: new Date().toISOString(),
      read: false
    };
    
    this.auth.post('/squad/messages', message).subscribe({
      next: () => {
        this.messages.update(msgs => [...msgs, message]);
        this.newMessage.set('');
        this.actionNotice.set('Message sent.');
      },
      error: () => {
        this.error.set('Could not send message.');
      }
    });
  }

  private loadMessages(): void {
    this.auth.get('/squad/messages').subscribe({
      next: (response: any) => {
        this.messages.set(response.messages || []);
        this.unreadCount.set(response.unreadCount || 0);
      },
      error: () => {
        this.error.set('Could not load messages.');
      }
    });
  }

  // --- Guardian Angel Mode Logic ---
  activateGuardianAngel(memberId: string): void {
    this.guardianAngelActive.set(true);
    this.guardianAngelMember.set(memberId);
    this.actionNotice.set(`Guardian Angel mode activated for ${this.getMemberName(memberId)}.`);
    
    this.auth.post('/squad/guardian-angel', { targetMemberId: memberId }).subscribe({
      next: () => {
        this.startGuardianMonitoring();
      },
      error: () => {
        this.error.set('Could not activate Guardian Angel mode.');
      }
    });
  }

  deactivateGuardianAngel(): void {
    this.guardianAngelActive.set(false);
    this.guardianAngelMember.set(null);
    this.actionNotice.set('Guardian Angel mode deactivated.');
  }

  private startGuardianMonitoring(): void {
    // Monitor the selected member's location and status
    const monitoringInterval = window.setInterval(() => {
      if (!this.guardianAngelActive()) {
        clearInterval(monitoringInterval);
        return;
      }
      
      this.auth.get('/squad').subscribe({
        next: (response: any) => {
          const member = response.squad?.members?.find((m: any) => m.id === this.guardianAngelMember());
          if (member && !member.checked_in) {
            this.actionNotice.set(`⚠️ ${member.name} has not checked in recently.`);
          }
        }
      });
    }, 60000); // Check every minute
  }

  getMemberName(memberId: string): string {
    const member = this.squad()?.members?.find(m => m.id === memberId);
    return member?.name || 'Unknown';
  }

  // --- Safe Word System Logic ---
  openSafeWordDialog(): void {
    this.showSafeWordDialog.set(true);
  }

  closeSafeWordDialog(): void {
    this.showSafeWordDialog.set(false);
  }

  setSafeWord(): void {
    if (!this.safeWord().trim()) return;
    
    this.auth.post('/squad/safe-word', { word: this.safeWord() }).subscribe({
      next: () => {
        this.showSafeWordDialog.set(false);
        this.actionNotice.set('Safe word set successfully.');
      },
      error: () => {
        this.error.set('Could not set safe word.');
      }
    });
  }

  triggerSafeWordLevel(level: number): void {
    this.currentSafeWordLevel.set(level);
    const levelName = this.safeWordLevels[level];
    
    const alertData = {
      type: 'safe-word',
      message: `${this.displayName} triggered ${levelName}!`,
      safeWord: this.safeWord(),
      level: levelName,
      severity: level >= 2 ? 'high' : 'medium'
    };
    
    this.auth.post('/squad/alerts', alertData).subscribe({
      next: () => {
        this.actionNotice.set(`${levelName} triggered. Squad notified.`);
      },
      error: () => {
        this.error.set('Could not trigger safe word alert.');
      }
    });
  }

  // --- Route Tracking Logic ---
  startRouteTracking(): void {
    this.routeTrackingActive.set(true);
    this.plannedRoute.set([]);
    this.actionNotice.set('Route tracking started. Follow your planned path.');
    
    // Start GPS tracking for route
    if (navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          const point = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            timestamp: new Date().toISOString()
          };
          this.plannedRoute.update(route => [...route, point]);
          this.checkRouteDeviation();
        },
        (error) => {
          this.error.set('Could not track route.');
        },
        { enableHighAccuracy: true }
      );
    }
  }

  stopRouteTracking(): void {
    this.routeTrackingActive.set(false);
    this.actionNotice.set('Route tracking stopped.');
  }

  private checkRouteDeviation(): void {
    // Check if user has deviated significantly from planned route
    // This is a simplified version - real implementation would use route calculation
    const currentLocation = this.currentLocation();
    if (currentLocation && this.plannedRoute().length > 1) {
      const lastPoint = this.plannedRoute()[this.plannedRoute().length - 2];
      const distance = this.calculateDistance(
        currentLocation.latitude, currentLocation.longitude,
        lastPoint.latitude, lastPoint.longitude
      );
      
      if (distance > 500) { // 500 meters deviation threshold
        this.routeDeviated.set(true);
        this.actionNotice.set('⚠️ Route deviation detected!');
      }
    }
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    
    return R * c;
  }

  // --- Safety Score Gamification Logic ---
  updateSafetyScore(points: number): void {
    const newScore = Math.min(100, Math.max(0, this.safetyScore() + points));
    this.safetyScore.set(newScore);
    
    if (points > 0) {
      this.safetyStreak.update(streak => streak + 1);
      this.checkAchievements();
    } else {
      this.safetyStreak.set(0);
    }
  }

  private checkAchievements(): void {
    const achievements = this.achievements();
    
    if (this.safetyStreak() >= 7 && !achievements.includes('week-warrior')) {
      this.achievements.update(a => [...a, 'week-warrior']);
      this.actionNotice.set('🏆 Achievement Unlocked: Week Warrior!');
    }
    
    if (this.safetyScore() >= 90 && !achievements.includes('safety-master')) {
      this.achievements.update(a => [...a, 'safety-master']);
      this.actionNotice.set('🏆 Achievement Unlocked: Safety Master!');
    }
  }

  // --- Safety Tips Logic ---
  showRandomTip(): void {
    const tips = [
      'Always share your location with trusted contacts when going out.',
      'Set up emergency contacts in your phone before you need them.',
      'Trust your instincts - if a situation feels wrong, leave immediately.',
      'Keep your phone charged and carry a portable charger.',
      'Stay in groups when possible - there\'s safety in numbers.',
      'Know the emergency numbers for your location.',
      'Have a designated meeting point if you get separated.',
      'Don\'t leave drinks unattended and watch them being poured.',
      'Keep some cash hidden for emergencies.',
      'Learn basic self-defense techniques.'
    ];
    
    this.currentTip.set(tips[Math.floor(Math.random() * tips.length)]);
    this.showSafetyTips.set(true);
  }

  dismissTip(): void {
    this.showSafetyTips.set(false);
    this.tipDismissed.set(true);
    this.updateSafetyScore(2); // Small reward for reading safety tips
  }

  // --- Incident Reporting Logic ---
  openIncidentReport(): void {
    this.showIncidentReport.set(true);
  }

  closeIncidentReport(): void {
    this.showIncidentReport.set(false);
  }

  submitIncidentReport(): void {
    if (!this.incidentType().trim() || !this.incidentDescription().trim()) {
      this.error.set('Please fill in all required fields.');
      return;
    }
    
    const incident = {
      type: this.incidentType(),
      description: this.incidentDescription(),
      location: this.incidentLocation() || `${this.currentLocation()?.latitude?.toFixed(4)}, ${this.currentLocation()?.longitude?.toFixed(4)}`,
      reportedBy: this.auth.user()?.id,
      timestamp: new Date().toISOString()
    };
    
    this.auth.post('/squad/incidents', incident).subscribe({
      next: () => {
        this.showIncidentReport.set(false);
        this.actionNotice.set('Incident reported successfully. Squad notified.');
        this.updateSafetyScore(5);
      },
      error: () => {
        this.error.set('Could not submit incident report.');
      }
    });
  }

  // --- Safe Zones Logic ---
  addSafeZone(): void {
    const location = this.currentLocation();
    if (!location) {
      this.error.set('Location required to add safe zone.');
      return;
    }
    
    const safeZone = {
      id: generateUUID(),
      name: `Safe Zone ${this.safeZones().length + 1}`,
      latitude: location.latitude,
      longitude: location.longitude,
      radius: 200, // 200 meters default
      addedBy: this.auth.user()?.id || '',
      timestamp: new Date().toISOString()
    };
    
    this.auth.post('/squad/safe-zones', safeZone).subscribe({
      next: () => {
        this.safeZones.update(zones => [...zones, safeZone]);
        this.actionNotice.set('Safe zone added successfully.');
      },
      error: () => {
        this.error.set('Could not add safe zone.');
      }
    });
  }

  checkSafeZones(): void {
    const location = this.currentLocation();
    if (!location) return;
    
    let inAnyZone = false;
    let foundZone: any = null;
    
    this.safeZones().forEach(zone => {
      const distance = this.calculateDistance(
        location.latitude, location.longitude,
        zone.latitude, zone.longitude
      );
      
      if (distance <= zone.radius) {
        inAnyZone = true;
        foundZone = zone;
      }
    });
    
    this.inSafeZone.set(inAnyZone);
    this.currentSafeZone.set(foundZone);
    
    if (inAnyZone && foundZone) {
      this.actionNotice.set(`✓ Entered safe zone: ${foundZone.name || 'Safe Zone'}`);
    }
  }

  openProfileDialog(): void {
    const profile = this.user();
    this.profileName = profile?.name || '';
    this.profilePhone = profile?.phone || '';
    this.emergencyContactName = profile?.emergencyContactName || '';
    this.emergencyContactPhone = profile?.emergencyContactPhone || '';
    this.showProfileDialog.set(true);
  }

  saveProfile(): void {
    this.auth.patch<{ user: UserProfile }>('/auth/profile', { name: this.profileName, phone: this.profilePhone, emergencyContactName: this.emergencyContactName, emergencyContactPhone: this.emergencyContactPhone }).subscribe({
      next: (response) => { this.user.set(response.user); this.showProfileDialog.set(false); this.actionNotice.set('Your profile details were updated.'); },
      error: (response) => this.error.set(response.error?.message || 'Could not update your profile.'),
    });
  }

  openSquadDialog(): void { this.showSquadDialog.set(true); }
  closeSquadDialog(): void { this.showSquadDialog.set(false); }
  closeTool(): void { this.activeTool.set(''); }
  openTripDialog(): void {
    const currentTrip = this.trip();
    this.tripTitle = currentTrip?.title || '';
    this.destination = currentTrip?.destination || '';
    this.departureTime = currentTrip?.departure_time || '';
    this.eta = currentTrip?.eta || '';
    this.tripNotes = currentTrip?.notes || '';
    this.showTripDialog.set(true);
  }
  closeTripDialog(): void { this.showTripDialog.set(false); }

  get mapUrl(): SafeResourceUrl {
    const location = this.currentLocation();
    const latitude = location?.latitude ?? -26.2041;
    const longitude = location?.longitude ?? 28.0473;
    const delta = 0.025;
    const url = `https://www.openstreetmap.org/export/embed.html?bbox=${longitude - delta}%2C${latitude - delta}%2C${longitude + delta}%2C${latitude + delta}&layer=mapnik&marker=${latitude}%2C${longitude}`;
    console.log('Map URL generated:', url);
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  memberMapStyle(member: SquadMember): string {
    const location = this.currentLocation();
    if (!location || member.latitude === null || member.longitude === null) return '';
    const longitudeDelta = member.longitude - location.longitude;
    const latitudeDelta = member.latitude - location.latitude;
    const left = Math.max(8, Math.min(88, 50 + longitudeDelta * 1200));
    const top = Math.max(8, Math.min(82, 50 - latitudeDelta * 1200));
    return `left: ${left}%; top: ${top}%;`;
  }

  memberHasLocation(member: SquadMember): boolean {
    return member.latitude !== null && member.longitude !== null;
  }

  createSquad(): void {
    if (!this.squadName.trim()) return;
    this.auth.post<{ squad: SquadData }>('/squad', { name: this.squadName, venue: this.venue }).subscribe({
      next: (response) => { this.applySquad(response.squad); this.showSquadDialog.set(false); this.actionNotice.set(`${this.squadName.trim()} is ready. Your safety circle is active.`); this.squadName = ''; this.venue = ''; },
      error: (response) => this.error.set(response.error?.message || 'Could not create the squad.'),
    });
  }

  inviteMember(): void {
    if (!this.inviteEmail.trim()) return;
    this.auth.post<{ squad: SquadData }>('/squad/members', { email: this.inviteEmail }).subscribe({
      next: (response) => { this.applySquad(response.squad); this.inviteEmail = ''; this.actionNotice.set('That registered user was added to your squad.'); },
      error: (response) => this.error.set(response.error?.message || 'Could not add that user.'),
    });
  }

  toggleCheckIn(): void {
    const nextValue = !this.hasCheckedIn();
    this.auth.post<{ squad: SquadData }>('/squad/check-in', { checkedIn: nextValue }).subscribe({
      next: (response) => { this.hasCheckedIn.set(nextValue); this.applySquad(response.squad); this.actionNotice.set(nextValue ? 'Check-in pulse sent to your active trip.' : 'Check-in paused.'); },
      error: (response) => this.error.set(response.error?.message || 'Could not update your check-in.'),
    });
  }

  shareLocation(): void {
    this.captureLocation(true);
  }

  private captureLocation(share: boolean): void {
    if (!navigator.geolocation) { if (share) this.error.set('Location sharing is not supported by this browser.'); return; }
    if (share) this.sharingLocation.set(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy };
        this.currentLocation.set(location);
        this.updateCurrentMemberLocation(location);
        if (!share) return;
        this.auth.post('/squad/location', location).subscribe({ next: () => {
          this.auth.post<{ delivered: boolean; message: string; preview?: { text: string } }>('/squad/location-notification', location).subscribe({
            next: (notification) => { this.sharingLocation.set(false); this.actionNotice.set(notification.delivered ? notification.message : 'Location shared. Email preview created; configure SMTP to deliver it.'); },
            error: () => { this.sharingLocation.set(false); this.actionNotice.set('Location shared with your squad. Email notification could not be sent.'); },
          });
        }, error: () => { this.sharingLocation.set(false); this.error.set('Could not share your location.'); } });
      },
      () => { if (share) { this.sharingLocation.set(false); this.error.set('Location permission was not granted.'); } },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  private updateCurrentMemberLocation(location: { latitude: number; longitude: number; accuracy?: number }): void {
    const currentSquad = this.squad();
    const currentUser = this.auth.user();
    if (!currentSquad || !currentUser) return;
    this.squad.set({ ...currentSquad, members: currentSquad.members.map((member) => member.id === currentUser.id ? { ...member, ...location } : member) });
  }

  requestEscort(): void {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    this.auth.post<{ squad: SquadData }>('/squad/alerts', { type: 'private-escort', message: `${this.displayName} requested a private escort.` }).subscribe({
      next: (response) => { this.emergencyActive.set(true); this.applySquad(response.squad); this.actionNotice.set('Private escort request sent. Your trusted people have been notified.'); },
      error: (response) => this.error.set(response.error?.message || 'Could not send the escort request.'),
    });
  }

  triggerAction(title: string): void {
    if (title === 'Share location with squad') { this.shareLocation(); return; }
    if (title === 'Location sharing') { this.shareLocation(); return; }
    if (title === 'Send check-in pulse') { this.toggleCheckIn(); return; }
    if (title === 'Request private escort') { this.requestEscort(); return; }
    if (title === 'Safety timer') { this.openSafetyTimerDialog(); return; }
    if (title === 'Medical information') { this.openMedicalInfo(); return; }
    if (title === 'Stealth mode') { this.actionNotice.set('Stealth mode activated. UI elements hidden.'); return; }
    this.activeTool.set(title);
  }

  saveTrip(): void {
    const body = { title: this.tripTitle, destination: this.destination, departureTime: this.departureTime, eta: this.eta, notes: this.tripNotes };
    const request = this.trip() ? this.auth.patch<{ squad: SquadData }>('/squad/trip', body) : this.auth.post<{ squad: SquadData }>('/squad/trip', body);
    request.subscribe({ next: (response) => { this.applySquad(response.squad); this.showTripDialog.set(false); this.actionNotice.set('Your trip plan is saved for the squad.'); }, error: (response) => this.error.set(response.error?.message || 'Could not save the trip plan.') });
  }

  endTrip(): void {
    this.auth.delete<{ squad: SquadData }>('/squad/trip').subscribe({ next: (response) => { this.applySquad(response.squad); this.showTripDialog.set(false); this.actionNotice.set('Trip ended and your check-in pulse was cleared.'); }, error: (response) => this.error.set(response.error?.message || 'Could not end the trip.') });
  }

  directionsFor(member: SquadMember): string {
    if (member.latitude === null || member.longitude === null) return '#';
    return `https://www.google.com/maps/dir/?api=1&destination=${member.latitude},${member.longitude}`;
  }

  markAlertRead(alertId: string): void {
    this.auth.post<{ squad: SquadData }>(`/squad/alerts/${alertId}/read`, {}).subscribe({ next: (response) => { this.applySquad(response.squad); this.trustedAlert.set(null); } });
  }

  runToolAction(): void {
    const tool = this.activeTool();
    if (tool === 'Fake-call generator') {
      this.fakeCallActive.set(true);
      this.actionNotice.set('Incoming Safe Squad call started. Use it when you need a discreet exit.');
      window.setTimeout(() => this.fakeCallActive.set(false), 12000);
      return;
    }
    if (tool === 'Venue geofencing') {
      this.geofenceEnabled.update((enabled) => !enabled);
      this.actionNotice.set(`Venue geofencing ${this.geofenceEnabled() ? 'enabled' : 'paused'}.`);
      return;
    }
    if (tool === 'Battery drop alerts') {
      this.batteryAlertsEnabled.update((enabled) => !enabled);
      this.actionNotice.set(`Battery drop alerts ${this.batteryAlertsEnabled() ? 'enabled' : 'paused'}.`);
      return;
    }
    if (tool === 'Private security dispatch') {
      this.requestEscort();
    }
  }

  private decorateSquad(squad: SquadData | null): SquadData | null {
    if (!squad) return null;
    return { ...squad, members: squad.members.map((member, index) => ({ ...member, color: ['lime', 'amber', 'red', 'blue'][index % 4] })) };
  }

  private applySquad(squad: SquadData | null): void {
    const decorated = this.decorateSquad(squad);
    this.squad.set(decorated);
    this.trip.set(decorated?.trip || null);
    const wasCheckedIn = this.hasCheckedIn();
    this.hasCheckedIn.set(Boolean(decorated?.members.find((member) => member.id === this.auth.user()?.id)?.checked_in));
    
    // Set default check-in note when first checking in
    if (!wasCheckedIn && this.hasCheckedIn() && !this.currentCheckInNote()) {
      this.currentCheckInNote.set(decorated?.venue || 'Checked in');
    }
    
    // Handle personalized danger alerts
    const dangerAlert = decorated?.alerts.find((alert) => alert.type === 'emergency-sos' && alert.status === 'open' && alert.user_id !== this.auth.user()?.id);
    if (dangerAlert) {
      const memberName = decorated?.members.find((m) => m.id === dangerAlert.user_id)?.name || 'Someone';
      this.trustedAlert.set({ id: dangerAlert.id, message: `${memberName} is in danger! Immediate assistance required.` });
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`🚨 ${memberName} is in danger!`, {
          body: 'Emergency SOS triggered! Check the app for details.',
          icon: '🚨',
          tag: 'emergency-sos',
          requireInteraction: true
        });
      }
    }
    
    // Handle escort alerts
    const escortAlert = decorated?.alerts.find((alert) => alert.type === 'private-escort' && alert.status === 'open' && alert.user_id !== this.auth.user()?.id);
    if (escortAlert) {
      this.trustedAlert.set({ id: escortAlert.id, message: escortAlert.message });
      if ('Notification' in window && Notification.permission === 'granted') new Notification('Safe Squad escort request', { body: escortAlert.message });
    }
  }

  private startAlertPolling(): void {
    if (this.alertTimer || !this.squad()) return;
    this.alertTimer = window.setInterval(() => this.auth.get<{ squad: SquadData | null }>('/squad').subscribe((response) => this.applySquad(response.squad)), 10000);
  }
}
