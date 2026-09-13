# Office editing, service areas, and page titles

## Changes
- Add page-header titles for `שותפים` and `הזמן חברים`, and shorten `משימות היום` to `משימות` everywhere it is used as a page title.
- Remove the read-only notice and all owner-only disabling from the `המשרד` tab.
- Save office name, both logos, and service areas against the active workspace so every workspace member edits the same office details.
- Replace the single-area interaction with a multi-select experience that adds multiple cities/areas, shows selected values, and allows removing each one.

## Backend permissions
- Add one authenticated workspace-scoped save function that verifies membership before updating the workspace owner’s office settings and service areas.
- Keep workspace isolation intact: users can edit only the workspace they currently belong to, while superadmins retain authorized access.

## Validation
- Check page titles on tasks, partners, and invite-friends pages.
- Check the Office tab as a non-owner member: edit office name, add/remove multiple service areas, change logos, and save.
