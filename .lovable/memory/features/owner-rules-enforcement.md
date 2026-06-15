---
name: Owner Rules Enforcement Across Generators
description: All AI generators MUST inject fetchSystemRulesBlock so owner directives (e.g. hide street numbers, append license number) are obeyed everywhere.
type: feature
---
Every function that drafts AI text for the owner must prepend the workspace
`system_intelligence_kb` block via `fetchSystemRulesBlock(userId, query)` AND
include a final user-prompt reminder telling the model to silently rewrite
until the draft complies with every ALWAYS/NEVER rule.

Wired in:
- ai-agent
- generate-content (rules + user-prompt reminder)
- generate-outreach-message
- outreach-suggest (rules pre-fetched once per batch, passed to draftWithAI)
- fb-engagement-draft (owner resolved via fb_engagement_settings.user_id)
- suggest-comment-reply
- master-research

formatBlock in `_shared/system-rules.ts` declares the block as HIGHEST PRIORITY,
NON-NEGOTIABLE and overriding persona/template/compliance defaults.

When adding a new generator, wire it the same way — never ship a generator that
ignores owner standing orders.
