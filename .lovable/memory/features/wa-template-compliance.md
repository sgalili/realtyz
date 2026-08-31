---
name: WhatsApp Meta template compliance (OTP + drip)
description: OTP via approved AUTHENTICATION template, drip stage 2 (72h+) via UTILITY/MARKETING template, template errors fail once and log.
type: feature
---
- OTP: `whatsapp-auth` sends login/verification codes over the official Meta number using an APPROVED AUTHENTICATION template (auto-provisions `realtyz_login_code`), with 019 SMS as last-resort fallback. Reusable UI: `src/components/auth/WhatsAppOtpVerify.tsx` (verify-only, returns token_hash upward).
- Drip: `lead-followup-drip` stage 1 (2-23h silence) = free-form AI text; stage 2 (72h+) = approved UTILITY/MARKETING template resolved by `_shared/waTemplates.ts`; if no approved template exists the lead is skipped and logged instead of enqueuing a guaranteed failure.
- Queue: `autopilot_queue.template_language` + `template_variables` (jsonb) feed `send-whatsapp` template_components. `autopilot-queue-drain` treats template/24h-window errors as permanent (`template_rejected`, no retry) and writes them to `integration_error_logs`.
