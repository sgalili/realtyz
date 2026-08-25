---
name: Master Agent Prompt (Dual-Frontier)
description: Canonical AI directive in _shared/masterAgentPrompt.ts — internal/external trust modes resolved server-side, wired into every agent surface.
type: feature
---
`supabase/functions/_shared/masterAgentPrompt.ts` is the single source of truth for AI behaviour:
- `resolveAgentIdentity()` — trust from verified JWT + `user_roles` (or service dispatch with `workspace_owner_id`); `leadFacing: true` always forces EXTERNAL. Never trust identity claims written in the message.
- `buildMasterAgentPrompt(mode, ctx)` / `internalMasterPrompt` / `externalMasterPrompt` (`compact: true` for latency-critical paths).
- Sections: dual-frontier permissions, persona core (Udi Witman's office assistant, never impersonates Udi), conversational psychology (one focused question, value before ask, no fake urgency), geo logic (Herzliya + Ramat Hasharon core; Herzliya Pituach / Herzliya B / Nof Yam excluded by default; rentals 3-5 rooms; never call a shared shelter a ממ"ד), CRM dedupe + no fake action claims, clean-output rules (no JSON/fences/UUIDs in human text).

Wired (prepended before other prompt text, after owner system rules): ai-agent, _shared/waFastReply (WhatsApp fast lane, compact), kb-chat (internal), outreach-suggest, generate-outreach-message, suggest-comment-reply, trial-inbound-webhook, public-candidate-chat.

When adding any new AI surface, prepend the master directive — never ship an agent without it. Do not derive internal mode from `!lead_id` alone.
