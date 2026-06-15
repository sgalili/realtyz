# Fix: Messenger Private Reply not sending

## Root cause (confirmed in logs)

`supabase/functions/ayrshare-comment-reply/index.ts` calls Ayrshare's DM endpoint with the wrong payload shape:

```
POST https://api.ayrshare.com/api/messages/facebook
body: { recipientId: "<COMMENT_ID>", message, searchPlatformId: true }
```

Meta returns:
```
(#100) Param recipient[id] must be a valid ID string (e.g., "123")
```

Why: `recipientId` must be a **user PSID**, not a comment ID. To send a Messenger Private Reply triggered by a comment, Ayrshare's documented contract is:

```
POST https://api.ayrshare.com/api/messages
{ platforms: ["facebook"], commentId: "<COMMENT_ID>", message: "..." }
```

This tells Meta "open Messenger thread tied to this comment's author" — the only legal way to DM someone who has not previously messaged the Page (and the 7-day Private Reply window).

Also the auto-like failure (`POST /api/comments/like` → "endpoint does not exist") is a stale path — the correct Ayrshare endpoint is `POST /api/comments` with `action: "like"` (or `/api/comments/{id}/like` per current docs). I will fix that in the same pass since it shares the helper file.

## Changes

### 1. `supabase/functions/ayrshare-comment-reply/index.ts`
- Replace the DM call with:
  - URL: `https://api.ayrshare.com/api/messages` (no platform in path)
  - Body: `{ platforms: [platform], commentId: nativeCommentId, message: sanitizedDm, searchPlatformId: true }`
- Keep nativeCommentId as the routing key (not freshReplyId). For comment-replies the inbound external_id is already the reply's commentId, which Meta accepts.
- Treat HTTP 200 + Ayrshare `status: "success"` as sent; surface Ayrshare error code/message in the response and persist into metadata so the UI shows why.

### 2. `supabase/functions/_shared/ayrshare-helpers.ts` — `likeNativeComment`
- Switch to Ayrshare's current like contract:
  - `POST /api/comments` with `{ platforms:[platform], id: commentId, action: "like", searchPlatformId: true }`
  - Fallback to `POST /api/comments/{id}` with `{ action:"like" }` if the first returns 404.
- Still non-fatal.

### 3. Extend DM coverage to **reply-on-reply** and **likes**
- **Comment replies (nested)**: already supported — `ayrshare-comments-fetch` writes nested replies as `engagement_events` rows with their own `external_id`. After the fix in §1, those will DM correctly because we pass `commentId`.
- **Likes**: Meta platform constraint — Messenger Private Reply requires a `commentId`. A like has no comment, so Meta will not authorize a DM to a liker who has never messaged the Page. We will:
  - Detect like events in `ayrshare-comments-fetch` ingestion and write them as `engagement_events` with `event_type='like'` (already done for comments; extend the mapper to likes when the webhook/poll returns them).
  - In `ayrshare-comment-reply`, if `event_type='like'`, skip the public reply and attempt a generic `POST /api/messages` with `recipientId = liker_psid` ONLY when Ayrshare exposes the PSID (it does for Page reactions via `/comments` v2 with `includeReactions=true`). If no PSID is available, mark the row `dm_skipped_no_psid` with a clear reason — no fake success.

### 4. Frontend (`src/components/campaigns/CampaignCommentsStream.tsx`)
- Surface the new `private_dm_status` / Ayrshare error code in the row toast so Udi sees "DM נשלח" vs "DM נחסם ע״י Meta — אין PSID לליייקר".

## Out of scope
- No schema changes. No new tables. `engagement_events.event_type` already supports 'like'.
- No changes to the public-comment reply flow itself; only the DM leg.

## Validation
1. Redeploy `ayrshare-comment-reply` + shared helpers.
2. Use `supabase--curl_edge_functions` to POST a known comment `event_id` and confirm:
   - `private_dm_sent: true`
   - Logs show `200` from `/api/messages` with `commentId` field.
3. Trigger on a nested reply → same outcome.
4. Trigger on a like row → either `private_dm_sent: true` (if PSID present) or explicit `dm_skipped_no_psid` reason.

## Technical detail (for reference)

Ayrshare Private Reply contract (Messenger / IG Direct):
```
POST /api/messages
Headers: Authorization, Profile-Key
Body: { platforms: ["facebook"], commentId, message }
```
Returns `{ status: "success", id: "<thread_id>" }` on success.
