# Remove Facebook OAuth redirect guards

## Changes
- Delete the Meta redirect-warning panel, Hebrew unauthorized-URI message, and frontend helper functions that classify or validate redirect-URI failures.
- Keep the canonical callback as a single constant: `https://realtyz.co.il/oauth/callback`.
- Update every Facebook Page and personal-profile connect trigger to request the OAuth URL with the pinned callback, then immediately navigate the top-level window using `window.top.location.href`.
- Preserve normal backend/network error reporting and the existing manual-token fallback, without translating failures into redirect-URI warnings.

## Verification
- Search the frontend to confirm the warning text and obsolete guard symbols are gone.
- Run focused tests/build validation and exercise the connections screen to confirm the connect button reaches the direct hand-off path without a warning overlay.

## Technical details
- Meta App ID remains globally pinned to `2885631568443536`.
- The backend still creates the signed OAuth state and authorization URL; the frontend performs no URI approval or mismatch validation before navigation.
