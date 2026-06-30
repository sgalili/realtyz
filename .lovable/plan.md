## Plan

1. **Restore the shared Facebook workspace connection**
   - Stop any automatic code path from clearing the workspace Facebook profile/page binding during transient provider failures.
   - Use the existing profile discovery/sync paths to re-bind the workspace to the active Ayrshare/Facebook profile instead of leaving `workspace_social_profile` empty.
   - Keep the shared connected Facebook page visible for all workspace users.

2. **Import and persist all native Facebook posts**
   - Refactor `fb-recent-posts` so it fetches the full available Facebook page history with robust pagination and higher scan limits.
   - Remove the early stop that quits after finding only 50 posts.
   - Deduplicate by the real native Facebook post id, not Ayrshare history ids, so the same post is not saved twice.
   - Persist every valid native page post into `campaign_logs` with media URLs, native post ids, timestamps, engagement counters, and the raw provider payload.
   - Add a safe one-time recovery import trigger from `/campaigns` that retries until the database has the expected full feed, instead of marking the browser session complete after a partial 12-post import.

3. **Fix the Add New Post publishing bug**
   - Harden `ayrshare-post` so a publish is only considered successful when Ayrshare returns a real Facebook post id with a success/published status.
   - After immediate publishing, perform a verification lookup against Ayrshare/Facebook history or post analytics/comments endpoint to confirm the post actually exists on the connected Facebook page.
   - If verification fails, return a clear failure response and do not show a success toast.
   - Persist `campaign_logs.status` as `sent` only after verified success; otherwise store `failed` with the provider error/details.

4. **Fix frontend status display**
   - Update `CampaignCenter.tsx` so the success toast and return to the sent-post list happen only when every selected Facebook target returns `verified: true` or is explicitly scheduled.
   - Show the real failure message when Facebook/Ayrshare rejects or fails to verify the post.
   - Refresh the campaign feed after verified publish/import so newly persisted posts appear in the global sent-post cards.

5. **Validate with backend data and function calls**
   - Call the import function and confirm `campaign_logs` contains the recovered native Facebook posts beyond the current 12.
   - Test a publish response path to ensure unverified posts fail visibly and verified posts save with a provider id.
   - Recheck `/campaigns` loads from database-backed rows for later sessions.