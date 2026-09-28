import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  
  // Check if user has a session token
  if (!auth.hasSession()) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }
  
  // Validate the session
  return auth.validateSession().pipe(
    map((valid) => {
      if (valid) {
        return true;
      }
      return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
    })
  );
};
