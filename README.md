# Taskio MVP

This is the repository for the Taskio MVP, a platform to connect homeowners with trusted, verified tradies through a secure payment system where funds are released after task completion approval.

The monorepo contains:

- `frontend/` — React application (Create React App)
- `backend/` — Express API
- `functions/` — Firebase Cloud Functions
- `shared/` — cross-tier constants used by frontend and backend

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

- **Frontend, backend and Cloud Functions:** Node.js **24** (see `.nvmrc` and package engines)

You can download Node.js from [nodejs.org](https://nodejs.org/).

### Installation

1.  **Clone the repository:**
    ```sh
    git clone https://github.com/<your-org-or-user>/Taskio-MVP.git
    cd Taskio-MVP
    ```

2.  **Set up the Backend:**
    ```sh
    cd backend
    npm install
    ```

3.  **Set up the Frontend:**
    ```sh
    cd ../frontend
    npm install
    ```

4.  **Set up Cloud Functions** (optional for local API/UI work; required when working on Functions):
    ```sh
    cd ../functions
    npm install
    ```

CI uses `npm ci` with lockfiles; locally, `npm install` is fine for getting started.

### Running the Application

You will need two separate terminals to run both the backend and frontend servers simultaneously.

1.  **Run the Backend Server:**
    In your first terminal, navigate to the `backend` directory and run:
    ```sh
    npm start
    ```
    The server should now be running on http://localhost:8000.

2.  **Run the Frontend Application:**
    In your second terminal, navigate to the `frontend` directory and run:
    ```sh
    npm start
    ```
    This will open the React application in your browser, usually at http://localhost:3000.

Localhost URLs above are for **local development only**. They are not a production hosting or API configuration.

## Engineering quality workflow

### Frontend

From `frontend/`:

```sh
npm run check:maintainability
npm run verify
npm run build
```

- `verify` runs the maintainability guardrail, then Jest (`--watchAll=false`).
- `build` produces the production bundle (also run under `CI=true` in GitHub Actions).

### Backend

From `backend/`:

```sh
node --check src/server.js
node --check src/app.js
npm test
```

Use `NODE_ENV=test` for tests (as CI does). Do **not** commit a `.env` file; tests are expected to run without secrets.

### Cloud Functions

From `functions/` (Node 24):

```sh
node --check index.js
npm run lint
```

Functions have a demo-project emulator suite. Run `npm test` from `functions/`; it cannot address either real Taskio Firebase project.

### Project standards / checklists

- `docs/ENGINEERING_STANDARDS.md`
- `docs/PR_CHECKLIST.md`
- `docs/MAINTENANCE_RHYTHM.md`
- `docs/OBSERVABILITY_AND_OPERATIONS.md`
- `docs/PILOT_RUNBOOK.md`
- `docs/SECRETS_AND_KEY_ROTATION.md`
- `docs/PRIVACY_RETENTION_AND_DSAR.md`
- `docs/INCIDENT_RESPONSE.md`

## Continuous integration

GitHub Actions workflow: `.github/workflows/ci.yml`

- Triggers: `pull_request`, and `push` to `main` and `develop`
- Permissions: read-only (`contents: read`); no deployment jobs
- Node **24** for all jobs (see `.nvmrc`)
- **security-rules:** Firestore/Storage emulator tests
- **frontend:** `npm ci` → `npm run verify` → `npm run build`
- **backend:** `npm ci` → syntax checks → `npm test` with `NODE_ENV=test`
- **functions:** `npm ci` → `node --check` → lint → Functions emulator tests
- **browser-smoke:** Playwright Chromium against a local mock/e2e harness (no real Firebase project)
- **api-image** / **webhook-image:** Docker image layout/smoke checks

CI does not deploy. CI also does not run `npm audit` as a merge gate.

## Environment variables (recommended)

Example env templates (do **not** commit real `.env` files):

- `backend/env.example` → copy into `backend/.env` (local only)
- `frontend/env.example` → copy into `frontend/.env` (local only)

### AI (Gemini) key safety

- **Gemini API keys must be backend-only** (use `backend/.env` → `GEMINI_API_KEY`).
- Do **not** place Gemini keys in frontend env vars (never `REACT_APP_*`).

### App Check (optional hardening)

Frontend scaffolding is in `frontend/src/firebase.js` behind env toggles:

- `REACT_APP_APPCHECK_ENABLED=true`
- `REACT_APP_APPCHECK_SITE_KEY=<reCAPTCHA v3 site key>`

For local dev, you can use a debug token:

- `REACT_APP_APPCHECK_DEBUG_TOKEN=true`

## Stripe Payments (Real Payment Flow)

Taskio uses **Stripe Checkout** to collect task payment securely, with webhook-driven payment confirmation.

### Backend environment variables

Set these in a local `backend/.env` (never commit it):

- **STRIPE_ENABLED**: set to `true` to enable Stripe payment flows
- **STRIPE_SECRET_KEY**: Stripe secret key (`sk_test_...` for test mode)
- **STRIPE_WEBHOOK_SECRET**: webhook signing secret (`whsec_...`) when Stripe is enabled
- **FRONTEND_URL**: frontend origin used for Stripe Connect return/refresh URLs
- **TASKIO_PUBLIC_SIGNUP_ENABLED**: production/pre-launch public enrollment. Exact `true` allows `POST /api/users/register` and Google expert enrollment. Missing, `false`, or any other value disables signup in production before Firebase Auth/Firestore writes. Safe value: `false`. Do not set `true` without explicit owner launch approval.

`POST /api/users/register` creates **expert (`tradie`) accounts only**. `role: 'homeowner'` is rejected with HTTP 400 before any Firebase Auth or Firestore write. Homeowner accounts are created only by the phone-verified posting flow, which is the single path that may grant quote access (`POST /api/me/homeowner/activate-quote-access`).

Example (placeholders only):

```sh
STRIPE_ENABLED=true
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
FRONTEND_URL=http://localhost:3000
```

### Frontend environment variables

Set these in a local `frontend/.env` (never commit it):

- **REACT_APP_API_BASE_URL** (optional for local work): defaults to `http://localhost:8000` — suitable for local development only; production builds must point at a real API base URL, not localhost

Hosted Stripe Checkout uses the Checkout Session URL returned by `POST /api/jobs/:jobId/checkout`. The frontend does **not** require `REACT_APP_STRIPE_PUBLISHABLE_KEY` or Stripe.js for that flow.

Example (placeholders only):

```sh
REACT_APP_API_BASE_URL=http://localhost:8000
```

### Notes

- `POST /api/jobs/:jobId/checkout` creates or reuses a Stripe Checkout session.
- Stripe webhooks are the source of truth for payment confirmation and funding updates.
- `POST /api/jobs/:jobId/payment-confirmed` is retained as a compatibility endpoint and can recover payment state from Stripe if webhook delivery lags.

Firebase Hosting may serve the frontend build (`frontend/build`), but that alone is **not** a complete full-stack production deployment while Express API hosting remains separately configured.
