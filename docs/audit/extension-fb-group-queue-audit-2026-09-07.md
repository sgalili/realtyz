# Audit: Browser extension + Facebook group posting queue (2026-09-07)

## Bottom line

The extension is a **read-only scraper**. It contains no code that talks to the backend
and no code that posts to Facebook. Every group post — instant or scheduled — is
published server-side through Meta's Graph API, which Meta is currently rejecting.
So the failure is not a broken selector or an RLS rule: the extension posting path
does not exist yet.

## 1. Extension → backend sync / polling

Files: `extension/manifest.json`, `extension/content.js`, `extension/facebook.js`.

- No `fetch` to Supabase anywhere in the extension. No project URL, no anon key,
  no session token, no polling loop against `campaign_activity_queue`.
- `manifest.json` `permissions: ["storage"]` only — missing `alarms` (background
  polling), `scripting`/`tabs` (driving a Facebook tab) and the Supabase host in
  `host_permissions`. There is also no `background.service_worker`, so nothing can
  run while the app tab is closed.
- The only transport is `chrome.storage.local` → `window.postMessage` on the app
  origin, one direction: Facebook DOM → app. Groups (`RZ_FB_GROUPS`), Page posts
  (`RZ_FB_POSTS`), comments (`RZ_FB_COMMENTS`).
- RLS / keys are therefore not the blocker. Confirmed in the database:
  `campaign_activity_queue` holds **3 rows total, all `manual_share`, all completed —
  zero `fb_group_post` rows** ever reached the queue table currently in use.

## 2. DOM automation & selectors

- `facebook.js` only *reads*: `a[href*="/groups/"]` for groups,
  `div[role="article"]` for posts and comments. Those selectors still resolve.
- There is **no composer automation at all**: no group-composer opening, no
  `contenteditable` text injection, no "Post" button click, no image attach,
  no post-success verification. Nothing can fail silently because nothing runs.
- Group scraping is fragile in one respect: it only sees what is rendered, so the
  broker must scroll the full groups list; ids captured from vanity URLs are stored
  as slugs (`herzelia1234`, `aicalling` are in `fb_group_post_log`), which the Graph
  path cannot post to.

## 3. Execution pipeline as it exists today

`FacebookGroupBulkPostCard` → either
(a) instant: `supabase.functions.invoke('fb-group-publish')`, or
(b) scheduled: insert into `campaign_activity_queue` (`activity_type='fb_group_post'`)
→ cron `process-activity-queue-5min` (active) claims ≤5 rows per workspace per wave
→ calls `fb-group-publish` with the service key
→ `fb-group-publish` claims a daily slot (`claim_fb_group_post_slot`) and POSTs
   `/{group-id}/feed` (or `/photos`) with the broker's personal user token.

Where it dies: Graph rejects the publish. `fb_personal_connections.last_error` for
both connected workspaces (last update 2026-09-01):

> "לפייסבוק אין הרשאה לפרסם בקבוצה הזו עבור האפליקציה. יש להשלים App Review…"

Stored scopes are `pages_show_list, business_management, pages_read_engagement,
pages_manage_posts, public_profile` — **`publish_to_groups` is absent**, and Meta no
longer grants it to new apps (Groups API publishing was retired for apps that were
not already whitelisted). No amount of code fixes this route; it requires App Review
plus the app being installed in each group, i.e. exactly the business verification
the requirement wants to avoid.

Side effects observed: the row still burns a daily slot then releases it, the queue
row lands in `status='ready' / publication_status='ready_awaiting_whatsapp_auth'`
with `payload.publish_error`, and the UI shows a soft failure rather than an error —
which is why it looks "silent".

## 4. Required fixes

To post without Meta verification the extension must become the executor. Concrete
changes:

1. `manifest.json`: add `"permissions": ["storage","alarms","scripting","tabs"]`,
   add the Supabase project URL to `host_permissions`, add
   `"background": { "service_worker": "background.js" }`.
2. New `extension/background.js`: on `chrome.alarms` (every 60s) call
   `POST /functions/v1/ext-queue-claim` with a **workspace pairing token** (not the
   user's JWT) stored in `chrome.storage.local`; receive due `fb_group_post` jobs
   (group id/url, text, image url, first comment) and report results back to
   `POST /functions/v1/ext-queue-report`.
3. New edge functions `ext-queue-claim` / `ext-queue-report` (public, verify the
   pairing token, service-role DB access): claim rows atomically
   (`status pending → processing`), and on report mark `completed` + write the
   `campaign_logs` row, or `failed` with the reason. Keeps RLS out of the loop.
4. New `extension/poster.js` injected into `facebook.com/groups/<id>`: open the
   composer (`div[role="button"]` whose text matches /כתוב משהו|Write something/),
   focus the `div[role="textbox"][contenteditable="true"]`, insert text via
   `document.execCommand('insertText')` (React-safe), attach media through the
   hidden `input[type="file"]`, click the `div[role="button"]` labelled /פרסם|Post/,
   then verify by re-reading the feed for the text; report success/failure with a
   screenshot-free reason string.
5. Pairing UI in the app: a one-click "חבר את התוסף" that mints the token and hands
   it to the extension over the existing `postMessage` bridge.
6. `process-activity-queue`: stop routing `fb_group_post` to `fb-group-publish`;
   leave those rows for the extension and only fail them after N minutes with no
   extension heartbeat. Keep `fb-group-publish` as an opt-in fallback.
7. Add a heartbeat row (`ext_last_seen`) so the app can tell the broker "התוסף לא
   פעיל — הפוסטים ממתינים" instead of silently queueing forever.

Human-cost note: DOM posting requires a logged-in Chrome session to be open at the
scheduled time, and Facebook rate-limits group posting aggressively; the existing
5-per-wave / daily-slot pacing should be kept.
