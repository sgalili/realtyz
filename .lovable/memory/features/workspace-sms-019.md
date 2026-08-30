---
name: Workspace-isolated 019 SMS + OTP fallback
description: Per-workspace 019 SMS credentials table, shared sms019 helper, and WhatsApp OTP SMS fallback.
type: feature
---
- Table `workspace_sms_settings(workspace_owner_id unique, provider, username, password, sender_id, is_active)`; RLS owner-or-admin. Each workspace sends SMS/OTP from its OWN 019 number; shared `api_configs('019 SMS')` row is only a last-resort fallback.
- Shared helper `supabase/functions/_shared/sms019.ts` (`resolveSms019Config`, `sendSms019(admin, phone, body, workspaceOwnerId)`), used by `send-message` and `whatsapp-auth`.
- `whatsapp-auth` falls back to 019 SMS when the Meta WhatsApp OTP send fails, resolving the workspace from `profiles.phone` → `active_workspace_owner_id`. Returns `{ success:true, channel:'sms' }`.
- UI: `src/components/profile/WorkspaceSmsCard.tsx` inside the Connections tab ("SMS (019) של מרחב העבודה").
- First-time onboarding: `FirstTimeSyncDialog` (mounted on /—Command Center) asks once for Google (combined Gmail/Calendar/YouTube consent via `src/lib/googleAllOAuth.ts`) + Facebook; no auto-redirects anymore.
- FB group publishing requires `publish_to_groups` (+`groups_access_member_info`) in `FB_PERSONAL_SCOPES`; `fb-group-publish` returns code `missing_group_scope` instead of failing silently.
