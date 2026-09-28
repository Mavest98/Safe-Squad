import { Routes } from '@angular/router';
import { App } from './app';
import { LoginComponent } from './login.component';
import { LandingComponent } from './landing.component';
import { authGuard } from './auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/landing', pathMatch: 'full' },
  { path: 'landing', component: LandingComponent },
  { path: 'dashboard', component: App, canActivate: [authGuard] },
  { path: 'login', component: LoginComponent },
  { path: '**', redirectTo: '/landing' }
];
