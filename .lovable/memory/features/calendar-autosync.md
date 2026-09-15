---
name: Google Calendar autosync (default, no manual buttons)
description: Every dated record (meetings, property_tours, scheduled_items, demo_requests, call_records) auto-mirrors to the connected Google Calendar on insert AND update; manual "add to calendar" buttons are removed.
type: feature
---
- Single entry point: edge fn `calendar-autosync` (kinds: meetings, property_tours, scheduled_items, demo_requests, call_records).
- DB triggers `trg_*_calendar_sync` fire AFTER INSERT **and** AFTER UPDATE whenever time/title/description/location/status/summary change, so an edit from ANY source or channel patches the existing Google event; cancelled/archived or cleared date deletes the event.
- `call_records` carries `google_event_id`/`google_event_link`; calls are logged even though `started_at` is in the past (`allowPast`) and never send a WhatsApp confirmation (`silent`).
- Token owner resolution: record owner, falling back to their `workspace_memberships.workspace_owner_id` when the member has no Google connection.
- NEVER re-add manual "הוספה ליומן" buttons/checkboxes (removed from IncomingLeadsPanel and NewDemoDialog). Only a read-only "ביומן Google" link is allowed.
