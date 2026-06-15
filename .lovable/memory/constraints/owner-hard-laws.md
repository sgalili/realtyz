---
name: Owner Hard Compliance Laws
description: Two non-negotiable laws enforced both via prompt (#CRITICAL_SYSTEM_PREFERENCES top block) and a deterministic post-processor for every AI-generated public-facing text.
type: constraint
---
HARD LAWS (always on, never optional):
1. **NEVER expose building / house numbers in property addresses.** "ארלוזורוב 26" → "ברחוב ארלוזורוב". Applies to posts, comments, replies, outreach, captions, IVR scripts, property profile drafts.
2. **ALWAYS append the broker license footer** on a new line at the absolute bottom of every generated post, outreach copy, and property profile draft: `רישיון תיווך מספר: <profiles.broker_license_number>`. If the column is empty, append `[יש להזין מספר רישיון בפרופיל]` so the owner notices.

Enforcement points:
- Prompt level: `_shared/system-rules.ts` formatBlock prepends both laws to `#CRITICAL_SYSTEM_PREFERENCES` (always emitted, even when the workspace has zero user-defined rules) and inlines the resolved license string.
- Post-processor: `_shared/owner-laws.ts` exports `stripStreetNumbers`, `appendLicenseFooter`, `enforceOwnerLaws`, `fetchOwnerLicense`. Wired into ayrshare-post (post + WA mirror), generate-content (post body), generate-outreach-message (subject/highlights stripped, message gets footer), outreach-suggest (drafts), draft-property-share (matchmaker drafts). Footer skipped on comment replies (fb-engagement-reply, ayrshare-comment-reply via sanitizeOutboundText) where it would feel out of place — street-number strip still runs.

Column: `profiles.broker_license_number text`. UI: Profile → Personal tab → "מספר רישיון תיווך" field.

When adding a NEW text generator: import `enforceOwnerLaws` + `fetchOwnerLicense` and run them on the buffer before returning / inserting into approval_queue / sending to a downstream API.
