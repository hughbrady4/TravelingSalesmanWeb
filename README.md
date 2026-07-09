# TravelingSalesmanWeb

Web application and Firebase backend for the Traveling Salesman project.

## Tech Stack

- Frontend: Vanilla JavaScript + Webpack + Bootstrap
- Backend: Firebase Cloud Functions (v2, ESM)
- Data/Auth: Firestore, Firebase Auth
- Payments: Stripe

## Repository Layout

- `src/`: frontend source files (edit these)
- `public/`: built frontend assets served by Firebase Hosting
- `functions/`: Cloud Functions source and scripts
- `dataconnect/`: Firebase Data Connect config and operations
- `firestore.rules`: Firestore Security Rules
- `firestore.indexes.json`: Firestore indexes
- `firebase.json`: Hosting, Functions, and emulator configuration

## Prerequisites

- Node.js
- npm
- Firebase CLI (`firebase`)

Cloud Functions target Node.js 22 (see `functions/package.json`).

## Install

From project root:

```bash
npm install
npm install --prefix functions
```

## Build Frontend

```bash
npm run build
```

Additional build modes:

```bash
npm run build:dev
npm run build:beta
npm run build:prod
```

## Run Emulators

Start all configured emulators from root:

```bash
firebase emulators:start
```

Configured ports (from `firebase.json`):

- Functions: `5001`
- Firestore: `8080`
- Auth: `9099`
- Hosting: `5002`

Run Functions emulator only:

```bash
npm run serve --prefix functions
```

## Lint Functions

```bash
npm run lint --prefix functions
```

## Deploy

Deploy Hosting + Functions from root:

```bash
firebase deploy
```

Deploy Functions only:

```bash
npm run deploy --prefix functions
```

## Development Notes

- Edit frontend code in `src/`, then rebuild so `public/` stays in sync.
- Treat JavaScript bundles in `public/` as generated artifacts.
- Functions deploy runs lint as a predeploy step.
- Root `test` script is currently a placeholder.
