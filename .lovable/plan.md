## Homely full integration — what I'll build

You confirmed three pillars:

1. **Each broker enters their own Homely username + password** (plus the existing client code) inside their personal API Settings.
2. **You (super admin) get an oversight console** — view every broker's connection status, push history, and force-disable a broken integration. No global API key.
3. **Inbound webhook** — Homely can call back into Realtyz when something changes on their side, per broker.

---

### What I still need from you

Before I code, please answer these two so I get it right the first time:

1. **Login URL & login flow Homely actually uses.**
   The Webtiv "Open Card" doc you shared has no login endpoint. Homely's broker-facing site lives somewhere like `https://crm.homely.co.il` (or similar) — I need:
   - The exact login page URL each broker uses today.
   - Whether the login posts a form (HTML) or hits a JSON endpoint.
   - If you have it: a screenshot of the broker dashboard's "API / Integrations / Webhooks" page.
   Without this, "username + password" can only be **stored**, not actually used to fetch data — Homely needs to expose either an API or a webhook trigger we can hook into.

2. **Webhook endpoint spec from Homely.**
   For inbound, Homely has to be able to POST to us. Does Homely's CRM have a documented webhook setting (where the broker pastes our URL), or do they only push via their own integrations? If yes, send the doc link.

If you don't have either, I'll still ship Pillars 1 & 2 (storage + oversight) and stub Pillar 3 with a generic `POST /homely-webhook/:broker_token` endpoint that you can configure in Homely once they expose it.

---

### What I'll build

#### 1. Per-broker credentials (encrypted at rest)

New table `homely_broker_credentials` (one row per user):
- `homely_username` (text)
- `homely_password_encrypted` (text — encrypted with `pgcrypto` using a server secret `HOMELY_CRED_KEY`)
- `homely_client_code` (already exists on `user_api_keys`, will move here)
- `homely_provider`, `homely_default_agent`, `homely_auto_push` (already exist, will migrate)
- `webhook_token` (random, used in inbound URL)
- `connection_status` ('not_configured' | 'ok' | 'failed' | 'disabled_by_admin')
- `last_verified_at`, `last_error`

RLS: brokers see/edit only their own row; super-admins see all.
Plain password is **never** sent back to the client — UI shows "•••• stored" with a "replace" affordance.

#### 2. ApiSettings UI (each broker)

The existing Homely card gets a new "Homely Account Login" panel:
- Username
- Password (write-only)
- "Test login" button → invokes `homely-verify-login` edge fn
- Status pill: green ✓ / red ✗ / gray (not configured) / orange (disabled by admin)
- The existing Open Card panel (client code / provider / agent / auto-push) stays.
- Inbound webhook URL: read-only, copyable: `https://<project>.supabase.co/functions/v1/homely-webhook/<webhook_token>` with a "Copy" button and a one-line instruction.

#### 3. Super-admin oversight console (`/settings/homely-admin`)

Visible only to `super_admin` / `admin`. Shows:
- Table of every broker: name, email, connection status, last verified, last push, push success rate (from `homely_push_log`).
- Per-row actions: **View push log**, **Disable** (sets `connection_status = 'disabled_by_admin'` — trigger then refuses to push), **Re-enable**, **Force re-test**.
- Aggregate counters at top: total brokers configured / failing / pushes today / last-24h error rate.
- Sidebar entry under "Settings" group: "Homely Admin" (admin-only).

#### 4. Edge functions (new)

- `homely-verify-login` — POST `{user_id?}`. Decrypts the broker's password, attempts the real Homely login (curl the page you give me), updates `connection_status` + `last_verified_at`. Logs to `integration_error_logs` on failure.
- `homely-webhook` — Public POST endpoint, route format `/homely-webhook/{token}`. Looks up the broker by `webhook_token`, validates payload, then either:
  - upserts into `leads` (if it's a new-lead event), or
  - updates an existing lead's stage (if it's a status-change event).
  All received payloads land in a new `homely_inbound_events` table for audit.
- `homely-push-lead` (existing) — extended to refuse when `connection_status = 'disabled_by_admin'`.

#### 5. Database changes

```text
ALTER TABLE user_api_keys
  DROP COLUMN homely_client_code, homely_provider,
              homely_default_agent, homely_auto_push;
  -- Migrated into the new dedicated table:

CREATE TABLE homely_broker_credentials (...)  -- see Pillar 1
CREATE TABLE homely_inbound_events (
  id, user_id, event_type, payload, processed, created_at
)
-- pgcrypto extension enabled in `extensions` schema
```

RLS:
- `homely_broker_credentials`: owner OR `is_admin_or_above`
- `homely_inbound_events`: owner OR `is_admin_or_above`
- All admin actions logged to `audit_logs`.

#### 6. Secrets

I'll request **one** new Lovable Cloud secret from you: `HOMELY_CRED_KEY` (any 32+ char random string — I'll generate it for you to paste). It's the symmetric key used by `pgcrypto` to encrypt the broker passwords at rest.

---

### Out of scope (won't touch)

- The existing Open Card auto-push trigger keeps working.
- The existing per-user `homely_api_key` field in `user_api_keys` stays (it's still used by `call-homely-api` proxy and `homely-search`).
- No changes to leads schema or any UI outside ApiSettings + new admin page.

---

**Reply with answers to the two questions above (or "go ahead, ship Pillars 1 & 2, stub Pillar 3") and I'll implement.**