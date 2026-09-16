# Comprehensive SMS, STT, Chat, UI, and Rita Fixes

## Scope

### 1. Make inbound SMS reliable and immediately visible
- Harden both 019 webhook entry points around one shared handler.
- Resolve the active workspace from the receiving number, match or create the contact, then persist the inbound SMS before any AI logic runs.
- Make provider-message deduplication deterministic and treat a failed database write as a webhook failure instead of acknowledging a lost message.
- Keep privacy-safe short polling for messages, invalidate the open inbox thread and conversation list immediately, and create one grouped in-app notification per contact.
- Preserve workspace isolation for contacts, messages, notifications, and Rita replies.

### 2. Replace fragile audio containers with one global WAV path
- Make the shared recorder capture browser PCM and encode a complete 16 kHz mono WAV for every transcription request, instead of falling back to WebM/MP4 when browser decoding fails.
- Validate duration, loudness, MIME type, file size, and WAV headers before upload; return short Hebrew errors rather than raw provider JSON.
- Use the default Lovable AI transcription model with auto language detection, preserving Hebrew, English, and mixed speech.
- Route Inbox, Properties search, Rita chat, global search, and other text transcription surfaces through the same shared recorder.
- Stop auto-submitting Properties and Rita chat after transcription. Each stop only fills or appends clean text; clicking the mic again records another segment and appends it.
- Add the mic at the top-left of the text area in Add Task, Add Call, and Add Tour, with the same append-only behavior. Keep editing dialogs consistent where they share these forms.

### 3. Stabilize chat entry and bubble layout
- Open Inbox and Rita chats at the latest message instantly, without smooth entry animation.
- Keep subsequent message updates pinned only when the user is already near the bottom, so reading older messages is not interrupted.
- Remove horizontal clipping containers, reserve avatar width, and constrain bubbles with logical padding, wrapping, and mobile-safe maximum widths.
- Keep notification deep links able to jump directly to a specific message without affecting normal chat entry.

### 4. Clean up the requested UI
- Remove the visible Yad2 twice-daily update sentence while leaving the twice-daily background schedule unchanged.
- Standardize all true list/grid selectors on the same global `List` and `LayoutGrid` icons, labels, sizes, and pressed states. Calendar selectors remain calendar controls rather than being mislabeled as grid views.

### 5. Repair Rita’s live CRM and property behavior
- Replace fragile model-generated read SQL for common CRM/property requests with explicit read tools that accept narrow validated filters and always enforce the active workspace.
- Keep write tools deterministic and workspace-scoped; correct contact/property ownership fields to the live schema and surface a useful Hebrew result when a tool fails.
- Continue sending full conversation history, but update Rita’s instructions to ask at most one necessary question and offer matching live properties as soon as enough criteria are known.
- Ensure property matching reads real address, city, rooms, size, price, deal type, publication status, and workspace ownership fields.

### 6. Enforce delayed SMS-to-WhatsApp handoff
- Count only inbound SMS messages from the client in the current contact thread.
- Never mention or link WhatsApp on the first client reply. Offer it once, only from the second inbound SMS onward.
- Always build the handoff destination with the official Meta number `972537983832` and a prefilled message containing the contact and current SMS context.
- Create/reuse the branded system short link and send the existing resolvable format `https://realtyz.co.il/r/{short_id}`. This preserves the working `/r/:slug` resolver; a bare root-level slug is not currently routable.

## Technical details
- Update the shared recorder, transcription function, three creation dialogs, Inbox, Properties, Rita drawer, shared message layout, SMS handler, and Rita tool definitions/execution.
- Deploy and invoke the changed transcription, SMS webhook, and Rita functions after code changes.
- Test with real spoken audio, an inbound 019-shaped webhook payload, a two-reply SMS thread, CRM/property queries, and mobile/desktop chat layouts.
- Verify no raw transcription or provider errors reach the interface, no cross-workspace data appears, and the official WhatsApp number is the only handoff target.
