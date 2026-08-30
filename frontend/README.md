# Taskio frontend

The frontend is a Create React App application for Taskio's public, client, Expert, and administrator experiences.

## Requirements and setup

- Node.js 24 (see the repository `.nvmrc`)
- `npm ci` from this directory
- a local environment file based on `env.example`; never commit local values

The development server uses port 3000 by default. The Express API uses port 8000 by default. Firebase web values are environment-driven and the expected-project guard prevents accidental project mismatch. See `docs/TASKIO_RELEASE_PLAN.md` for the manual environment-switch checklist. Do not use the retired staging template.

## Commands

```sh
npm start
npm run check:maintainability
npm test -- --watchAll=false
npm run verify
npm run build
npm run e2e:install
npm run e2e
```

`npm run e2e` starts a local mock API and a frontend configured only with the Firebase demo project ID `demo-taskio-e2e`. The browser harness blocks non-local network requests.

## Generated shared files

`src/shared/auLocations.js`, `src/shared/expertiseCatalog.js`, and `src/shared/jobStatusesConstants.generated.js` are generated from the repository-level `shared/` source files. The `prestart`, `pretest`, and `prebuild` scripts run `scripts/syncShared.js`; do not edit generated copies directly.

## Production build safety

Production builds require an HTTPS API origin, a matching expected Firebase project ID, and E2E bypass disabled. App Check is disabled by default; when enabled it fails closed without a public site key and rejects production debug tokens. See `docs/APP_CHECK.md`. Deployment is a separate, owner-approved operation; a successful build does not deploy anything.
