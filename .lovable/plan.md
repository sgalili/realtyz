# Inbox SMS sync and layout update

## What will change
- Keep every Rita SMS reply in the conversation record and make the open contact chat refresh immediately through the existing privacy-safe polling path.
- Add a grouped system notification for newly generated Rita SMS replies, scoped to the active workspace.
- Make SMS automation obey both the workspace Auto AI setting and the contact-level Auto AI switch.
- Keep Rita messages on their current side, move contact messages and the contact photo to the opposite side, and make the photo open the CRM card while preserving the inbox return position.
- Reduce channel/logo controls by 20%, keep the inbox header and controls fixed, and allow only the message transcript to scroll.
- Center the four inbox filters relative to the viewport and reuse the same tab dimensions and styling on the Tasks page.

## Technical details
- Reuse the installed AI Elements message primitives for the visible message rows instead of introducing new chat primitives.
- Preserve workspace isolation on all message, settings, and notification queries.
- Validate the result in the signed-in preview at mobile and desktop sizes, including scrolling, tab alignment, CRM return, and Auto AI behavior.
