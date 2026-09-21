import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { AuthService, UserProfile } from './auth.service';

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
  imports: [FormsModule],
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
  ];

  constructor(private readonly auth: AuthService, private readonly router: Router, private readonly sanitizer: DomSanitizer) {}

  ngOnInit(): void {
    this.user.set(this.auth.user());
    this.auth.get<{ squad: SquadData | null }>('/squad').subscribe({
      next: (response) => { this.applySquad(response.squad); this.loading.set(false); this.startAlertPolling(); },
      error: (response) => { this.error.set(response.error?.message || 'Could not load your squad.'); this.loading.set(false); },
    });
    this.captureLocation(false);
  }

  get displayName(): string { return this.user()?.name?.split(' ')[0] || 'there'; }

  logout(): void { this.auth.logout(); this.router.navigateByUrl('/login'); }

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
    this.hasCheckedIn.set(Boolean(decorated?.members.find((member) => member.id === this.auth.user()?.id)?.checked_in));
    const newAlert = decorated?.alerts.find((alert) => alert.type === 'private-escort' && alert.status === 'open' && alert.user_id !== this.auth.user()?.id);
    if (newAlert) {
      this.trustedAlert.set({ id: newAlert.id, message: newAlert.message });
      if ('Notification' in window && Notification.permission === 'granted') new Notification('Safe Squad escort request', { body: newAlert.message });
    }
  }

  private startAlertPolling(): void {
    if (this.alertTimer || !this.squad()) return;
    this.alertTimer = window.setInterval(() => this.auth.get<{ squad: SquadData | null }>('/squad').subscribe((response) => this.applySquad(response.squad)), 10000);
  }
}
