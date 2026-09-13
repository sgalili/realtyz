# Facebook refresh and Rita chat fixes

## Outcome
- Keep a linked Facebook Page visibly connected and green during every post refresh.
- Replace Rita assistant robot marks with Rita’s profile photo throughout the product.
- Open Rita’s chat at the latest message instantly and add a safe full-chat reset.

## Implementation
1. **Facebook refresh isolation**
   - Make the manual refresh call only the post-import endpoint with the existing workspace Page credential.
   - Remove permission/token validation and live-insights probes from the refresh-button path.
   - Preserve the connection cache, connected channel state, and existing post rows for every refresh result, timeout, or provider error.
   - Continue walking Graph history with opaque `after` cursors until exhausted or the requested limit is reached.
   - Convert refresh failures into a compact, dismissible notice with a reconnect action; never emit the current missing-read-permission banner from this action.

2. **Rita identity**
   - Add one reusable Rita avatar component backed by Rita’s central profile image, with a stable local fallback.
   - Replace robot icons only where they represent the assistant herself: the global launcher, chat header, chat empty state, AI-response identity, and assistant message identity surfaces.
   - Keep robot icons that describe unrelated automation, bot detection, or monitoring tools.

3. **Rita chat behavior**
   - Compose the visible chat with the installed AI Elements conversation/message/prompt primitives while preserving current attachments, voice input, research mode, charts, links, and quick prompts.
   - Load history first, then place the transcript at the absolute bottom before the opened drawer is painted; subsequent messages stay pinned without smooth animation.
   - Add an `איפוס צ'אט` control in the chat header with confirmation, delete only the signed-in user’s Rita history, clear local chat/input/attachments state, and return to a fresh empty conversation.

## Validation
- Verify manual refresh on `/campaigns` keeps Facebook connected and preserves posts on success, timeout, and simulated permission failure.
- Verify cursor pagination and no duplicate validation retry from the refresh action.
- Verify Rita’s image on mobile and desktop assistant surfaces.
- Verify chat opens at the bottom without a visible jump and reset clears both the screen and persisted history after reopening.
- Run the project checks and focused browser tests.
