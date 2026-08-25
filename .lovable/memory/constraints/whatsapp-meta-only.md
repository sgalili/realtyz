---
name: WhatsApp = Official Meta Cloud API only
description: All WhatsApp chat, /inbox, sending and inbound webhooks run exclusively on the official Meta Cloud API; Green API is messaging-forbidden (avatars only).
type: constraint
---
WhatsApp messaging is 100% Official WhatsApp Business API (Meta Cloud API, graph.facebook.com). Forbidden to reintroduce any alternative gateway or fallback transport for chat.

- Outbound: `send-whatsapp` → `sendViaWba` only. No Green API branch, no `qr_session` routing, no `GREEN_API` provider value. `resolveWorkspaceOwner()` only resolves the owning workspace, never a transport.
- Inbound: `whatsapp-webhook` accepts ONLY the official Meta envelope (`object=whatsapp_business_account` / `entry[]`). Anything else returns `ignored: non_official_provider_payload`. `meta-wa-webhook` forwards the original Meta payload.
- `greenapi-webhook` is deprecated for messaging: it never writes leads/messages/chat_history and never triggers autopilot; it only honours `stateInstanceChanged`.
- Green API survives strictly as an auxiliary avatar helper (`_shared/greenApiCreds.ts` `triggerAvatarFetch`, `fetch-wa-avatars`), fully decoupled from chat; fall back to initials when unavailable.
- Settings UI (`WhatsAppConnectionModeCard`) shows the official connection only — no QR-session mode selector.
