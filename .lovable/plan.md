Plan

1. Make native Facebook posts permanent
- Keep `campaign_logs` as the single source of truth for the campaigns list, because it already drives the global cards, delete button, refresh button, counters, thumbnails, expansion, and comments tree.
- Add a backend uniqueness guard so the same Facebook post can only exist once per workspace owner by `provider_message_id`.
- Refactor `fb-recent-posts` so it does not only return temporary posts to the browser. It will fetch the connected Facebook Page history, map every active native post into `campaign_logs`, and upsert rows instead of replacing or deleting anything.
- Store all needed native data in `campaign_logs.provider_response`: Facebook post IDs, URL, media thumbnails, raw provider payload, timestamp, and engagement counters.
- Preserve old rows forever. If the live API returns only 10 posts on a later call, the function will update those 10 but will not archive, remove, or shrink the 150 already stored rows.

2. Restore the current 150 native posts now
- After the persistence function is in place, run one backend import for the connected workspace profile and Facebook Page.
- Verify the database count rises from the current small persisted set to the full native Facebook history available from the Page.
- Keep the Ayrshare profile currently connected to the workspace and store imported rows under the workspace owner account so all workspace users see the same campaign list.

3. Render only the persisted global list
- Update `/campaigns` so the list is loaded from `campaign_logs` first.
- Remove the transient “synthetic external rows” behavior from the frontend. Native Facebook posts will no longer disappear when session cache clears because they will already exist in the database.
- Extract thumbnails, post URL, and metrics from `provider_response` for both Realtyz-created posts and imported native Facebook posts.
- Keep one unified global card list only. No “recent posts” section.
- Update sidebar campaign counters to count persisted campaign cards from the database instead of relying on sessionStorage.

4. Fetch comments, replies, likes, shares for all stored posts
- Expand the metrics/comment sync functions to process all persisted Facebook campaign rows, not only the first 50 or first small page.
- Batch requests safely so all 150 posts can be refreshed without one failed post blocking the rest.
- Keep comments/replies in the existing comment-tree pipeline so every expanded card uses the same comments UI.
- Update counters with “never decrease because of a transient zero” logic, so a bad provider response cannot wipe visible engagement numbers.

5. Enforce AI autopilot only when the related switches are on
- Chat autopilot: WhatsApp/inbox auto-replies will require both the global AI autopilot switch and the contact-level autopilot switch, and will also respect the AI pause kill-switch.
- Queue/autopilot sends: the queue worker will check the global AI autopilot switch before sending automatic WhatsApp follow-ups, not only the pause flag.
- Social comment replies: public AI replies will continue to require the positive/negative auto-reply switches. Private DMs and auto-likes will stop running unconditionally and will be gated by the same relevant auto-reply switch decision.
- Post autopilot: scheduled/queued posting automation will respect the posting delivery policy switch before anything is published automatically. If the switch is off, posts remain ready for manual approval instead of auto-posting.
- Manual actions remain manual: clicking “generate draft”, “send”, “refresh replies”, or “publish now” will still work because those are not autopilot.

6. Verification
- Query the database after import to confirm the persisted Facebook campaign count.
- Test `/campaigns` load behavior: first entry imports once if needed, refresh/re-entry reads from database, and the count does not drop back to 10.
- Test one expanded imported post card for thumbnail, delete, refresh replies, comments tree, and counters.
- Test autopilot-off and autopilot-on paths so AI never auto-sends while the related switch is off and resumes only when enabled.