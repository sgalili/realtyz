---
name: Homely & WebTiv are read-only
description: Never write/push data to Homely or WebTiv; also no WhatsApp/SMS invite flow — Meta Cloud API allows direct first messages.
type: constraint
---
- Homely / WebTiv are strictly PULL-ONLY. Never POST/PUT records to them (`WebtivLidPost`, Open Card push, etc.).
  `homely-push-lead` returns `{ skipped: true, reason: "homely_read_only" }`; `webtiv-homely-sync` has a no-op `pushToHomely`.
  The `homely_push_on_lead_insert` trigger was dropped and `user_api_keys.homely_auto_push` is forced false.
- No SMS/WhatsApp "invite to channel" modal anywhere. We are on the official Meta Cloud API, so WhatsApp messages
  can be initiated to any valid Israeli number without an invite.
- The inbox composer (input + attachment + channel picker + send) must ALWAYS be visible, regardless of autopilot state.
- Typing a raw Israeli mobile number in the inbox search offers "start chat" and auto-creates the CRM lead card.

**Why:** Client requirement — external CRMs must not be mutated, and messaging must be frictionless.
