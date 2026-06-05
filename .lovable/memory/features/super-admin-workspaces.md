---
name: Super-admin workspace creation
description: Super admin can create new users; each gets their own workspace, 1000 NIS balance, and unlimited usage caps.
type: feature
---
- Edge function: `super-admin-create-user` (verifies caller has super_admin role, uses service role to `auth.admin.createUser` with `email_confirm: true`, upserts profile with `is_unlimited=true`, `created_by_super_admin=true`, `workspace_owner_id=newUid`, `wallet_balance_agorot=100000`, `plan_status='active'`, grants `managing_broker` role, audit-logs the action, and optionally sends WhatsApp credentials via existing `send-whatsapp` edge fn forced to GreenAPI).
- Profile columns added: `is_unlimited` (bool), `created_by_super_admin` (bool), `workspace_owner_id` (uuid; defaults to user's own id = workspace = self).
- `enforce_trial_lead_cap()` trigger now early-returns when `profiles.is_unlimited = true`, bypassing both the 100-lead trial cap and trial-time-expired check.
- UI: `SuperAdminCreateUserCard` on `/super-admin` → "משתמשים" tab. Inputs: email, full name, phone (for WA), generated/edited temp password, send-WA switch.
- Workspace model: each created user IS their own workspace owner; data scopes by existing `assigned_to`/`user_id` columns (no schema-wide refactor).
