import { Routes } from '@angular/router';
import { App } from './app';
import { LoginComponent } from './login.component';

export const routes: Routes = [
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: 'dashboard', component: App },
  { path: 'login', component: LoginComponent },
  { path: '**', redirectTo: '/dashboard' }
];
