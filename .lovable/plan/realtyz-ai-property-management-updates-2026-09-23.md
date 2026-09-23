# Realtyz AI property management updates

## Scope
- Make the affiliate data table horizontally scrollable on narrow screens and in preview.
- Add permanent deletion for one or multiple properties from the property-management surfaces.
- Keep selection controls hidden until the user enables multi-select mode.
- Remove the icon beside the office-notes field.

## Safety and behavior
- Require an explicit confirmation before permanent deletion.
- Delete only properties the signed-in workspace is authorized to manage.
- Refresh all affected property lists immediately after deletion.
- Preserve the existing RTL layout, filters, tabs, and property-editing flow.

## Technical details
- Reuse existing buttons, dialogs, table patterns, and design tokens.
- Inspect the existing listings ownership fields and row-level rules before choosing direct deletion or a secured database function.
- Verify single deletion, bulk deletion, mobile table scrolling, and clean default list state.
