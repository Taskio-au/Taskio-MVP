# PR Checklist

## Scope

- [ ] Change is scoped and does not include unrelated edits.
- [ ] Behavior changes are documented in PR description.

## UI / UX

- [ ] Reused shared design primitives/tokens where applicable.
- [ ] No new `window.prompt` / `window.confirm`.
- [ ] Loading, error, and empty states are handled.

## Code Health

- [ ] No new non-legacy frontend file exceeds 500 lines.
- [ ] Legacy files touched include at least one extraction/refactor where practical.
- [ ] No obvious duplication introduced.

## Verification

- [ ] `frontend: npm run check:maintainability`
- [ ] `frontend: npm run test -- --watchAll=false`
- [ ] `frontend: npm run build` (for UI-impacting changes)
- [ ] backend touched files pass `node --check`
- [ ] backend: `npm test` (including route contract tests)
- [ ] Profile compliance docs match enforced backend/frontend rules (no drift)

## Tests

- [ ] New or updated tests cover key changed behavior.
- [ ] Existing tests still pass locally.
- [ ] `PUT /api/me/profile` lock and compliance regressions are covered.
