---
name: WhatsApp transport = workspace choice (Meta official or personal QR)
description: Each workspace picks one WhatsApp method for all messages; OTP always ships from the official Meta number. Green API is the personal QR transport only.
type: constraint
---
Superseded the old "Meta only" rule (user decision, Sep 2026).

- `workspace_whatsapp_settings.connection_type` = `official_meta` | `qr_session` is the single source of truth, chosen in the Connections tab (`WhatsAppConnectionModeCard`).
- `send-whatsapp`: `qr_session` sends plain text through Green API (`resolveGreenCreds` + `sendGreenApiText`); approved templates, media and `force_official: true` always go through Meta Cloud (`sendViaWba`).
- OTP (HARD): `whatsapp-auth` always passes `force_official: true` — verification codes never leave a personal number.
- Personal number: exactly ONE instance per workspace, provisioned automatically by `greenapi-session` `create_instance` on first QR request. No manual Instance ID / API Token fields, no "add instance", no avatar-sync button on that card (avatar sync lives in the CRM page menu only).
- Inbound: `whatsapp-webhook` for Meta envelopes; `greenapi-webhook` for the personal QR session.
