# Landing and Facebook comment synchronization

## Outcome
- Remove the empty strip above the `/landing` header and its lower divider.
- Rename every landing demo action from "תיאום דמו בזום" to "להדגמה בזום".
- Replace actual `AIZA` product copy with "ריטה" without altering unrelated API-key examples such as `AIzaSy`.
- Restore a visible Rita reply action beneath every Facebook comment and reply.
- Add confirmed deletion for every comment and reply, synchronized with Facebook in both directions.

## Implementation
1. **Landing polish**
   - Remove the top rotating strip that creates the entry gap.
   - Remove the header bottom border.
   - Update the demo button and dialog title text.

2. **Comment controls**
   - Keep the Rita reply action rendered beneath each non-page-authored comment and reply, independent of prior reply status.
   - Add a trash icon to every comment/reply row and a Hebrew confirmation dialog.
   - Optimistically remove a confirmed deletion, restore it on failure, clear cached copies, and update the visible counter.

3. **Facebook deletion and reconciliation**
   - Add a validated `delete` action to the existing Meta comments function.
   - Resolve the native comment ID inside the active workspace, delete it through the active Page token, then archive the matching local comment and descendants.
   - During refresh, reconcile the fetched Meta tree against stored rows for those posts and archive rows no longer present natively.
   - Extend webhook removal handling to archive the deleted comment, descendants, and matching tracked-comment records.

## Validation
- Check `/landing` on mobile and desktop for flush entry, borderless header, and updated text.
- Verify reply and delete controls on top-level comments and nested replies.
- Verify app-originated deletion calls Facebook and removes the row/count.
- Verify native Facebook deletion disappears after webhook or manual refresh and decrements the count.
- Run focused checks and deploy the updated Meta comment functions.
