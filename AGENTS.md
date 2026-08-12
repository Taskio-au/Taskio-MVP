# Taskio stable instructions

This file contains stable, permanent working agreements for this repository.

## Repository and Git safety

- Work on `develop` unless Saeed explicitly approves another branch.
- Before every task, confirm the branch, HEAD, ahead/behind status, and working-tree state.
- Preserve unrelated user changes.
- Never use `git add -A` or `git add .`.
- Stage only explicitly reviewed, task-specific files.
- Never commit, push, merge, rebase, deploy, delete files, or modify external resources without Saeed's explicit approval.
- Do not rewrite Git history or use destructive Git commands.
- Never deploy directly to production as an incidental part of another task.

## Secrets and security

- Never display, copy, commit, or expose secret values.
- Do not modify or commit `.env`, `.env.local`, service-account files, tokens, API keys, webhook secrets, or credentials.
- Environment templates may contain variable names and safe placeholders only.
- Use managed secrets for deployed environments.
- Stripe staging must use test mode only.
- Do not inspect or display production user data or personal information.

## Firebase environments

- Production Firebase project: `taskio-v2`.
- Staging Firebase project: `taskio-v2-staging`.
- `taskio-v2` production must remain protected and unchanged unless Saeed explicitly approves a production action.
- Never run `firebase deploy` while the active target is ambiguous.
- Always state the exact project ID and resources targeted before requesting deployment approval.
- Do not deploy `develop` directly to the `taskio-v2` live Hosting site.
- Use `australia-southeast1` (Sydney) for staging services unless Saeed approves a change.
- Staging data must be synthetic and isolated from production.
- Never copy production user data into staging.

## Development workflow

- Inspect relevant existing code and documentation before editing.
- Make small, themed changes.
- Avoid unrelated refactoring.
- Add or update tests when behaviour changes.
- Run the smallest relevant tests first, followed by the appropriate broader test suite.
- Report commands run, test results, and any unverified areas.
- Review `git diff` before presenting work.
- Do not claim success when tests or verification have not passed.
- Ask before installing or upgrading dependencies.
- Maintain existing project conventions unless an approved task requires changing them.

## Approval boundaries

Saeed's approval to investigate or plan does not authorize implementation.

Approval to edit code does not authorize commit, push, deployment, or external-resource changes.

Treat each of the following as a separate approval boundary:

- repository edits;
- commit;
- push;
- Firebase/GCP resource changes;
- deployment;
- billing or production changes.

## Branding

- Do not use or introduce the old navy/orange chain-link Taskio logo.
- Branding assets require Saeed's explicit approval.

## Completion report

At the end of each task, report:

- files changed;
- material behaviour changes;
- tests and checks run;
- Git status;
- whether anything was committed, pushed, or deployed;
- any remaining blockers or required approvals.
