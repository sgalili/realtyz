---
name: System Intelligence KB
description: Workspace-scoped continuous learning rules table + ingest-system-rule edge fn + SystemRulesInput UI. Injects #CRITICAL_SYSTEM_PREFERENCES into ai-agent and generate-content.
type: feature
---
Table `system_intelligence_kb` (workspace_owner_id, rule_text, signal: directive|negative|positive, embedding 1536, weight, is_active, source: kb_ui|whatsapp_text|whatsapp_voice|approval|rejection|edit_diff).

`match_system_rules(workspace, vec, k)` RPC orders by signal priority (directive>negative>positive) then weight then cosine.

`_shared/system-rules.ts` exposes `fetchSystemRulesBlock(userId, query, k=8)` with 30s LRU cache and `hasSystemRuleTrigger(text)` regex (Hebrew+English).

Capture points:
- `ingest-system-rule` fn: accepts text or audio_base64 (Gemini transcribes), normalizes via gemini-2.5-flash-lite JSON, embeds with openai/text-embedding-3-small (1536), inserts.
- `whatsapp-webhook`: owner text matching trigger → fire-and-forget. Voice notes matching trigger after transcription → fire-and-forget.
- `wa-companion-router`: on `פרסם` approve → log positive reinforcement with the approved draft text.

Injection points (prepended to system prompt):
- `ai-agent/index.ts` (chat + Master Agent + Deal Room replies)
- `generate-content/index.ts` (posts)

UI: `SystemRulesInput` on /knowledge-base — RTL textarea + mic, list of active rules with toggle/delete.
