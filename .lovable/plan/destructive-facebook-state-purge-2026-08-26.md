# Destructive Facebook State Purge

## Goal
Make disconnect irreversible until the user explicitly reconnects, permanently reject the “Employee” identity, and ensure all UI state comes from the current database binding rather than browser caches or background repair.

## Changes
1. **Backend disconnect and validation**
   - Hard-delete the workspace’s Facebook page bindings, personal Facebook credentials, Facebook/Instagram social connection credentials, and imported Facebook group state.
   - Verify every relevant table is empty before returning success.
   - Reject and purge “Employee”, blocked asset IDs, non-authoritative page IDs, missing tokens, and user-level identities.

2. **Remove automatic resurrection**
   - Remove repair/rebind behavior from `health` and `status`; these endpoints become read-and-validate only.
   - Keep page discovery and binding exclusively inside explicit OAuth/manual connect actions.
   - Remove environment/global token recovery from ordinary status checks so a disconnected workspace cannot silently reconnect.

3. **Database enforcement and cleanup**
   - Run a destructive cleanup migration for invalid Facebook identities and credentials.
   - Strengthen database triggers so blocked identities and non-authoritative page bindings cannot be inserted or updated.

4. **Frontend synchronization**
   - Make the health hook fetch fresh backend state on mount and stop using cached healthy state as a connection fallback.
   - Treat “Employee”, an invalid page ID, or missing verified page data as disconnected and clear browser/React Query state immediately.
   - Make disconnect clear UI state optimistically, execute the hard backend wipe, then fetch clean backend state before completing.

5. **Verification**
   - Check the affected tables for invalid rows.
   - Validate disconnect and remount behavior in the running app, including badges and warning banners.
