# Facebook callback and slide cleanup

## Changes
- Replace the callback’s overlapping timers with one absolute eight-second deadline that ends loading on every failure path.
- Preserve exact provider and backend error details in browser logging while showing a clear Hebrew error card with retry and return actions.
- Add an eight-second overall deadline to the Facebook exchange handler, while retaining per-stage Graph error reporting and safe response bodies.
- Remove secondary explanatory copy from onboarding/tutorial slide bodies so each active slide has one short bold heading only; keep required form controls and navigation actions.

## Verification
- Check callback timeout, provider rejection, and retry states in the browser.
- Search all onboarding/tutorial slide components for remaining description fields or secondary paragraphs.
- Run focused validation for the changed frontend and Facebook connection function.
