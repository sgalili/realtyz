---
name: No markdown asterisks in generated text
description: AI-generated posts, comments, replies, email, SMS must never contain `*` or `**`. Only WhatsApp Green API output may keep `*bold*` (native WA syntax).
type: constraint
---
AI-generated text destined for social posts, social comments/replies, email, or SMS MUST have all markdown emphasis stripped (`*`, `**`, `_`, `__`, `` ` ``, leading `#` headers).

WhatsApp Green API output is the ONLY exception — `*bold*` renders natively in WA, so do NOT strip asterisks there.

Implementation:
- `stripMarkdownEmphasis()` in `supabase/functions/_shared/ayrshare-helpers.ts` is the canonical helper.
- Already wired into: `generate-content` (regex), `suggest-comment-reply` + `ayrshare-comment-reply` (via `sanitizeOutboundText`), `ayrshare-post`, `fb-engagement-reply`, `generate-outreach-message` (only when `channel !== "whatsapp"`).
- When adding new generation/outbound functions, apply the helper before persisting/sending unless the channel is WhatsApp.

**Why:** Public posts and DMs render literal asterisks as junk, looking robotic/AI-generated.
