# Taskio status

This is a dynamic project handoff status file. Update it whenever a phase is completed.

**Last updated:** 13 August 2026

## Repository baseline

- Current branch: `develop`
- Baseline HEAD: `88ab54afb8a6a348e0a74d1bd5208e30b8419e8d`

## Firebase environments

- Production project: `taskio-v2`
- Production URL: <https://taskio-v2.web.app>
- Production Firestore and Functions region: `australia-southeast1`
- Staging project: `taskio-v2-staging`
- Staging display name: Taskio Staging
- `.firebaserc` keeps `default` → `taskio-v2` and adds the explicit alias `staging` → `taskio-v2-staging`.
- The default alias remains production for compatibility. Never deploy without selecting and confirming the exact project ID and resources.
- `frontend/env.staging.example` defines safe placeholders for a staging-only frontend build. Supply them through the staging build environment (or an ignored `.env.production.local` for a deliberate local staging build). The app rejects partial Firebase overrides and project-ID mismatches.

## Phase and environment status

- Phase 2V-A: complete (staging project creation).
- Phase 2V-B: complete (staging foundation only).
- Blaze billing is linked to `taskio-v2-staging`.
- One staging Web App is registered without Firebase Hosting.
- Firestore `(default)` and the default Storage bucket exist in `australia-southeast1` (Sydney) with deny-all production-mode rules and no data/files.
- Authentication is initialized with no sign-in providers enabled.
- Hosting and Functions remain uninitialized. No Express backend or frontend has been deployed.
- No staging secrets, CORS, App Check, Stripe webhook, rules/index deployment, or seed data have been configured.
- Production remains unchanged.

## Main staging blockers

- The remote Express staging API is not deployed.
- The frontend build can fall back to `http://localhost:8000`.
- Staging secrets, CORS, App Check, and the Stripe test webhook are not configured.
- Firestore/Storage security concerns must be resolved before production.

## Next approved action

Review these repository-only staging configuration changes. Commit and push require separate approval.

After that, define the isolated staging backend and deployment plan before creating or deploying any service. Enabling Authentication providers also remains blocked pending matching app configuration and security review.

Production deployment remains prohibited.
