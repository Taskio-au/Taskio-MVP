# Taskio Engineering Standards

This document defines the minimum standards for frontend and backend changes.

## 1) UI Consistency

- Prefer shared primitives from `frontend/src/design/components` over ad-hoc UI.
- Add/extend design tokens in `frontend/src/design/tokens.js` before introducing new colors/spacing.
- Avoid adding new blocking browser dialogs (`window.prompt`, `window.confirm`); use in-app modals.

## 2) File Organization

- Group by feature first (`frontend/src/features/...`) when logic grows beyond one screen.
- Keep container pages focused on orchestration; move modal blocks and complex subsections into feature components.
- For new non-legacy files, keep files under ~500 lines.

## 3) Styling

- Avoid creating new pages with large inline style blobs.
- Reuse shared components and tokenized styles where possible.
- If inline styles are used, keep them local and minimal.

## 4) Testing Requirements

- Every bug fix needs at least one automated test covering the regression.
- Every critical flow change must include smoke tests for:
  - auth/role access,
  - quote/payment transitions,
  - admin actions.
- Prefer colocated tests (`*.test.js`) near the utility/feature they validate.

## 5) Review Guardrails

Before merging:

- `npm run verify` in `frontend/`
- `node --check` for touched backend route/modules
- no new maintainability check failures

## 6) Legacy Debt Strategy

- Legacy large files have temporary line budgets enforced by script.
- Do not increase legacy file size unless unavoidable.
- Extract one meaningful block (component/hook/helper) whenever touching a legacy file.
