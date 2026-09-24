# Rita AI audit (2026-09-24)

## 1. Prompts, persona, state
- `_shared/masterAgentPrompt.ts`: the base rules. `resolveAgentIdentity()` sets internal or external mode from the verified sender, never from what the message claims.
- `_shared/waFastReply.ts`: builds the WhatsApp prompts.
  - `buildFastReplyPrompt`: for contacts.
  - `buildStaffReplyPrompt`: for internal users (no pitch, no qualifying questions).
  - `buildRecruitmentReplyPrompt`: for brokers (Zoom demo).
  - `buildFocusBlock`: adds the property in focus and the role check.
- `ai-agent/index.ts`: the heavy path with tools. It adds a PROPERTY ANCHOR block (address, rooms and price parsed from the message text) and a ban on "I don't know" fallbacks.
- There is no explicit state machine. The conversation "state" is only the message history sent with each turn: the last 24 messages from the `messages` table, falling back to `chat_history`. Nothing records which qualification step the contact has reached.

## 2. How property details get into the context
- `_shared/focusProperty.ts`
  - `matchListingFromText`: matches the street name (required), then city, house number and neighborhood. It searches up to 300 of the workspace's listings.
  - `renderFocusPropertyBlock`: address, city, deal type, rooms, m², floor, parking, elevator, features, price and description.
- `whatsapp-webhook` (around lines 1264-1305) resolves the property in this order:
  1. The current message text.
  2. The last 8 messages the contact sent (added today).
  3. The listing id from a referral tag, short link or shared context, or `lead.interest_tag`.
- Gaps:
  - The rescue fast-lane call (around line 1422) gets no `focusProperty` or `contextBlock`.
  - The SMS path (`_shared/smsInboundHandler.ts`) calls `ai-agent` with no property resolution at all.
  - `ai-agent`'s anchor comes from the message text only, not from the database.

## 3. Loop prevention and direct answers
- Prompt rules: answer first, give key highlights, then at most one optional question. Never repeat a sentence or question, and accept answers that don't fit a form.
- Code guard in `generateFastReply`: if the draft matches an earlier reply, or its closing question already appears in an earlier reply, it makes one corrective retry with a higher temperature.
- The `ai-agent` path has no code-level repeat guard; it relies on prompt rules only.
- Whether a direct question gets answered depends on the property details being in the context. There is no deterministic intent handler (for example "rooms?" answered straight from the database).

## 4. Tables, logs, webhooks
- Inbound:
  - `whatsapp-webhook` (Meta).
  - `sms-019-webhook` and `sms-inbound-webhook`, both running `_shared/smsInboundHandler.ts`.
  - `meta-dm-webhook`, `trial-inbound-webhook`, `public-candidate-chat`, `kb-chat`.
- Storage:
  - `messages`: every channel. Duplicates are caught by `metadata.message_id`, or the same text within 60 seconds.
  - `chat_history`: a legacy mirror.
  - `leads`: `interest_tag`, `preferences`, `last_interaction_at`, `status`.
  - `listings`, `notifications`, `autopilot_queue`, `approval_queue`, `interaction_activity_log`.
- Delivery status: Meta status webhooks update messages by wamid, and failures are logged.
- Errors go to `integration_error_logs` via `logIntegrationError` (fast-lane failure, ai-agent status or exception, CRM counts).
- Models (Gemini on chat completions):
  - Fast lane: `google/gemini-3-flash-preview`.
  - `ai-agent`: gemini-3-flash-preview and gemini-2.5-flash.
  - `kb-chat` and `trial-inbound-webhook`: gemini-2.5-flash.
  - `public-candidate-chat` uses a legacy embeddings model.

## Recommended fixes (priority order)
1. Pass `focusProperty` and `contextBlock` into the rescue fast-lane call.
2. Add the same property resolution to the SMS handler before it calls `ai-agent`.
3. Add a deterministic answer for property-fact questions (rooms, floor, price, size) when a property is in focus.
4. Add the repeat guard to the `ai-agent` output as well.
5. Store the qualification state in `leads.preferences`, such as fields already asked and answered, so questions are chosen from data rather than from the prompt alone.
6. `public-candidate-chat` still reads legacy political columns (`candidate_name`, `thesis`, `pillars`) that were removed. It will fail and should be rewritten or retired.
