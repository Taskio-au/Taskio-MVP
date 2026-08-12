# Taskio status

This is a dynamic project handoff status file. Update it whenever a phase is completed.

**Last updated:** 12 August 2026

## Repository baseline

- Current branch: `develop`
- Baseline HEAD: `78fc522d2d208d07d72a6ebd7c5e98f72673b76f`

## Firebase environments

- Production project: `taskio-v2`
- Production URL: <https://taskio-v2.web.app>
- Production Firestore and Functions region: `australia-southeast1`
- Staging project: `taskio-v2-staging`
- Staging display name: Taskio Staging
- Current Firebase CLI target remains `taskio-v2`.
- `.firebaserc` currently contains only `default` → `taskio-v2`.

## Phase and environment status

- Phase 2V-A: complete.
- The staging project was created successfully.
- No staging web app, Firestore database, Auth, Storage, Functions, Express backend, or deployment has been intentionally provisioned yet.
- An empty default Hosting site may appear from project bootstrap, but nothing has been deployed.
- Production remains unchanged.
- Blaze billing status: action required / not yet confirmed.

## Main staging blockers

- Blaze billing is not confirmed.
- Staging services are not provisioned.
- The remote Express staging API is not deployed.
- The frontend build can fall back to `http://localhost:8000`.
- Staging secrets, CORS, App Check, and the Stripe test webhook are not configured.
- Firestore/Storage security concerns must be resolved before production.

## Next approved action

Saeed manually links `taskio-v2-staging` to an owned Cloud Billing account and confirms Blaze. Do not perform this action automatically.

Production deployment remains prohibited.
