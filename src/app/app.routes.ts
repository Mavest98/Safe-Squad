import { Routes } from '@angular/router';
import { authGuard } from './auth.guard';
import { App } from './app';
import { LoginComponent } from './login.component';

export const routes: Routes = [
	{ path: '', pathMatch: 'full', redirectTo: 'dashboard' },
	{ path: 'login', component: LoginComponent },
	{ path: 'register', component: LoginComponent },
	{ path: 'dashboard', component: App, canActivate: [authGuard] },
	{ path: '**', redirectTo: 'dashboard' },
];
