import { Component, ViewEncapsulation, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './app.scss',
  encapsulation: ViewEncapsulation.None,
})
export class LoginComponent {
  readonly loginMode = signal<'login' | 'register'>('login');
  readonly error = signal('');
  readonly busy = signal(false);
  email = '';
  password = '';
  name = '';
  phone = '';
  emergencyContactName = '';
  emergencyContactPhone = '';

  constructor(private readonly auth: AuthService, private readonly router: Router, private readonly route: ActivatedRoute) {
    if (this.route.snapshot.routeConfig?.path === 'register') this.loginMode.set('register');
  }

  submit(): void {
    this.error.set('');
    if (this.loginMode() === 'register' && this.name.trim().length < 2) {
      this.error.set('Enter your full name.');
      return;
    }
    if (!this.email.trim() || this.password.length < 8) {
      this.error.set('Use a valid email and a password with at least 8 characters.');
      return;
    }
    this.busy.set(true);
    const request = this.loginMode() === 'login'
      ? this.auth.login(this.email, this.password)
      : this.auth.register({ name: this.name, email: this.email, password: this.password, phone: this.phone, emergencyContactName: this.emergencyContactName, emergencyContactPhone: this.emergencyContactPhone });
    request.subscribe({
      next: () => this.router.navigateByUrl(this.route.snapshot.queryParamMap.get('returnUrl') || '/dashboard'),
      error: (response) => { this.error.set(response.error?.message || 'The service is unavailable. Start the API and try again.'); this.busy.set(false); },
    });
  }

  toggleMode(): void {
    this.loginMode.update((mode) => mode === 'login' ? 'register' : 'login');
    this.error.set('');
  }
}
