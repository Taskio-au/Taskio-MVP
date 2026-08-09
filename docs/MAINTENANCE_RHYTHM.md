# Maintenance Rhythm (Weekly)

Use this cadence to improve consistency/maintainability without halting feature delivery.

## Weekly Allocation

- ~80% feature work
- ~20% maintainability budget

## Weekly Maintainability Slice

1. Pick one legacy screen/module (e.g. `Dashboard.js`, `JobDetail.js`, `HomeownerJobDetail.js`).
2. Extract one contained unit:
   - modal,
   - sub-section component,
   - utility/helper module,
   - API adapter.
3. Add or update tests for the touched behavior.
4. Run guardrails:
   - `npm run check:maintainability`
   - `npm run test -- --watchAll=false`

## Monthly Goal

- Reduce one legacy file's line budget by 5-10%.
- Increase smoke coverage of critical flows.
- Replace repeated inline UI patterns with shared primitives.

## Stop Conditions

Pause refactor and ship if:

- behavior risk increases,
- deadlines block safe extraction,
- test stability drops.

Resume next slice from the same file.
