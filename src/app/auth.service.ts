import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, tap } from 'rxjs';
import { Router } from '@angular/router';

export interface SessionWarning {
  show: boolean;
  timeRemaining: number;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: UserProfile;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly apiUrl = 'http://localhost:3000/api';
  readonly user = signal<UserProfile | null>(null);
  private inactivityTimer?: number;
  private readonly INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutes
  private lastActivityTime = Date.now();

  constructor(private readonly http: HttpClient, private readonly router: Router) {
    this.setupInactivityTracking();
    const token = localStorage.getItem('safe-squad-token');
    if (token) {
      this.http.get<{ user: UserProfile }>(`${this.apiUrl}/auth/me`, { headers: this.headers() }).pipe(catchError(() => of(null))).subscribe((response) => {
        if (response) {
          this.user.set(response.user);
          this.resetInactivityTimer();
        } else {
          this.logout();
        }
      });
    }
  }

  private setupInactivityTracking(): void {
    // Track user activity
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    events.forEach(event => {
      window.addEventListener(event, () => this.resetInactivityTimer());
    });

    // Check inactivity every minute
    setInterval(() => {
      const inactiveTime = Date.now() - this.lastActivityTime;
      if (inactiveTime >= this.INACTIVITY_TIMEOUT && this.user()) {
        console.log('Auto-logout due to inactivity');
        this.logout();
      }
    }, 60000); // Check every minute
  }

  private resetInactivityTimer(): void {
    this.lastActivityTime = Date.now();
  }

  private clearInactivityTimer(): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
    }
  }

  register(details: { name: string; email: string; password: string; phone: string; emergencyContactName: string; emergencyContactPhone: string }): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/register`, details).pipe(tap((response) => this.saveSession(response)));
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/login`, { email, password }).pipe(tap((response) => this.saveSession(response)));
  }

  logout(): void {
    this.clearInactivityTimer();
    localStorage.removeItem('safe-squad-token');
    this.user.set(null);
    this.router.navigate(['/login']);
  }

  hasSession(): boolean {
    return !!localStorage.getItem('safe-squad-token');
  }

  validateSession(): Observable<boolean> {
    return this.http.get<{ user: UserProfile }>(`${this.apiUrl}/auth/me`, { headers: this.headers() }).pipe(
      map((response) => {
        if (response) {
          this.user.set(response.user);
          return true;
        }
        return false;
      }),
      catchError(() => of(false))
    );
  }

  get<T>(path: string): Observable<T> {
    return this.http.get<T>(`${this.apiUrl}${path}`, { headers: this.headers() });
  }

  post<T>(path: string, body: unknown): Observable<T> {
    return this.http.post<T>(`${this.apiUrl}${path}`, body, { headers: this.headers() });
  }

  patch<T>(path: string, body: unknown): Observable<T> {
    return this.http.patch<T>(`${this.apiUrl}${path}`, body, { headers: this.headers() });
  }

  delete<T>(path: string): Observable<T> {
    return this.http.delete<T>(`${this.apiUrl}${path}`, { headers: this.headers() });
  }

  private headers() {
    return { Authorization: `Bearer ${localStorage.getItem('safe-squad-token') || ''}` };
  }

  private saveSession(response: AuthResponse): void {
    localStorage.setItem('safe-squad-token', response.token);
    this.user.set(response.user);
  }
}
