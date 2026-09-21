# Safe Squad

Safe Squad is an Angular safety companion with a local Express API, SQLite persistence, bcrypt password hashing, JWT authentication, protected routes, squad membership, check-ins, alerts, and browser location sharing.

## Run locally

From the project directory:

```powershell
npm install
npm start
```

Open `http://localhost:4200`. The command starts the Angular app and API together. The API runs at `http://localhost:3000` and creates `data/safe-squad.sqlite` automatically.

Register an account with a name, email, password, phone number, and emergency contact. Create a squad, register another account, then invite that account by email from the squad dialog.

## Security notes

Passwords are hashed with bcrypt and protected API routes require a signed JWT. Set a strong `JWT_SECRET` environment variable before any shared or production deployment; `.env.example` shows the required variables. The SQLite database is intentionally ignored by Git.

Browser location sharing requires user permission and a secure context in deployed environments. The local development server supports testing on localhost.

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.1.8.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
