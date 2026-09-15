# Affiliate property card refinements

## Changes
- Add the broker licence number to the shared broker attribution block.
- Show broker attribution only in affiliate-facing cards and public property pages, never in the broker's own property experience.
- Redesign affiliate list cards as a compact single row: 25px square image, full address, rooms, size, price, and a larger icon-only expand control.
- Remove the “כל הפרטים” / “הסתרת פרטים” labels while preserving expand and collapse behavior.

## Technical details
- Extend the affiliate marketplace response and public listing endpoint with `broker_license_number`; extend the marketplace response with property `sqm`.
- Keep the existing grid cards unchanged apart from licence attribution and the larger icon-only expand control.
- Gate attribution by affiliate role in the authenticated affiliate screen; public pages always retain legally required attribution.
- Apply the database function signature update through a migration and verify both mobile list rendering and public property rendering.
