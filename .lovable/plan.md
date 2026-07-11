## Root cause

Edge function `send-message` (used for Messenger, Instagram, LinkedIn, Telegram, Email, etc.) fails on every send with:

```
DB insert error: PGRST204
"Could not find the 'target_voter_id' column of 'approval_queue' in the schema cache"
```

The `approval_queue` table was renamed as part of the voters→leads pivot: the column is now `target_lead_id`, but `supabase/functions/send-message/index.ts` still inserts `target_voter_id: lead_id`. The insert throws, the function returns 500, and the UI just shows "failed to send" with no clear reason.

The Messenger DM path itself is fine — it never reaches any Messenger/Ayrshare API because it dies at the approval-queue insert first.

## Fix

**1. `supabase/functions/send-message/index.ts`**
- Replace `target_voter_id: lead_id` with `target_lead_id: lead_id` in the `approval_queue.insert(...)` payload (line 113).
- Improve error surface: on the DB insert failure return the actual Postgres `code` + `message` (not just a generic string) so future schema drift is visible in the toast instead of a bare 500.

**2. Sanity sweep**
- `rg` for any other `target_voter_id` / `voter_id` references in `supabase/functions/**` and `src/**` and fix any stragglers found (expect none based on the memory note that the rename was completed, but verify).

**3. Verify**
- Redeploy `send-message`.
- From the Inbox, send a Messenger message to a lead that has `messenger_id` / `facebook_user_id`; confirm:
  - No 500 in `edge-function-logs-send-message`.
  - A row is queued in `approval_queue` with `target_lead_id` populated and `platform='messenger'`.
  - Toast in the UI reports success (queued for approval).
- Repeat quickly for `instagram` and `email` channels to confirm the same path works.

## Notes / non-goals

- No schema changes — the DB is already correct; only the edge function is stale.
- No changes to the actual Messenger delivery path (Ayrshare / m.me invite links). Those only run after approval, so they were never reachable until this insert succeeds.
- Not touching the WhatsApp path (goes through Green API, not this queue).
