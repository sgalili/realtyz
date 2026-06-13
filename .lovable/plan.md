# Continuous Learning Engine + Dynamic Persona Adaptation

Build a workspace-scoped "system intelligence" layer that captures explicit owner rules (text or voice) and reinforcement signals (approve/edit/reject), then injects matching rules into every AI generation as `#CRITICAL_SYSTEM_PREFERENCES`.

We already have `agent_learning_lexicon` (edit-diff rules) and `knowledge_chunks` (KB RAG). This adds a **rules layer** distinct from both: explicit, durable, owner-priority directives.

## 1. Database (one migration)

**`system_intelligence_kb`** — scoped by workspace_owner_id; role-tagged.
- `id`, `workspace_owner_id` (uuid, NOT NULL), `created_by` (uuid), `actor_role` (text: 'owner'|'tenant'|'system'), `source` (text: 'kb_ui'|'whatsapp_text'|'whatsapp_voice'|'approval'|'rejection'|'edit_diff'), `rule_text` (text, the canonical imperative rule), `raw_input` (text, original utterance/transcript), `signal` (text: 'positive'|'negative'|'directive'), `weight` (numeric default 1.0), `embedding` (vector(1536)), `is_active` (bool default true), `expires_at` (timestamptz null), `metadata` (jsonb), `created_at`, `updated_at`.
- GRANT SELECT/INSERT/UPDATE/DELETE to authenticated; ALL to service_role. No anon.
- RLS: members of the workspace (via `workspace_memberships`) can SELECT; only owner + admins can INSERT/UPDATE/DELETE.
- HNSW index on embedding (vector_cosine_ops).
- `match_system_rules(workspace uuid, query vector, k int)` SECURITY DEFINER RPC returning top-k active rules ordered by `signal_priority` (negative+directive boosted) then cosine.

## 2. Edge functions

**New: `ingest-system-rule`** — accepts `{ text?, audio_base64?, audio_format?, source, role? }`. If audio, transcribe via Lovable AI Gateway (gemini-2.5-flash with `input_audio`). Detect Hebrew trigger phrases (`תמיד|מעכשיו|אל תשתמש|תזכור|חוק חדש|לעולם|כלל חדש|מהיום`) — if none and `source=whatsapp_text`, return `{captured:false}`. Otherwise call AI gateway to normalize the utterance into a concise English imperative rule + signal classification (`directive|negative|positive`). Embed via `google/gemini-embedding-001` truncated to 1536 dims (match column). Insert into `system_intelligence_kb`.

**New: `_shared/system-rules.ts`** — helper used by every generation function:
```ts
export async function fetchSystemRules(workspaceOwnerId, queryText, k=8): Promise<string>
```
- 30s in-memory LRU cache keyed by `${workspace}:${hash(queryText)}` for fast webhooks.
- Embeds queryText, calls `match_system_rules`, formats as a `#CRITICAL_SYSTEM_PREFERENCES\n- rule1\n- rule2` block. Negative/directive rules listed first with `NEVER:`/`ALWAYS:` prefixes.

**Edit existing generation paths** to prepend the block to their system prompt (minimal touch — one helper call near top):
- `_shared/persona.ts` (chat/autopilot/inbox replies)
- `ayrshare-post/index.ts` (posts)
- `fb-comment-reply` / equivalent
- `voice-agent` script builder
- `ai-agent` drawer

**Edit `whatsapp-webhook/index.ts`** — after admin identification, before normal router: if the inbound message matches the trigger lexicon OR is a voice note from a workspace owner/super_admin, fire-and-forget POST to `ingest-system-rule` (don't block reply). Voice notes always go through ingestion (transcript reused for normal handling).

**Edit `wa-companion-router.ts`** — on `פרסם`/`אשר`/`approve` recognize as positive reinforcement: log the just-approved draft via `ingest-system-rule` with `signal='positive', source='approval'`. On reject/edit, log negative with the diff (delegate to existing `learn-from-edit` for edits — already in place).

## 3. Client (KB UI)

**`src/components/strategybank/SystemRulesInput.tsx`** — new card on `/knowledge-base`:
- Hebrew RTL textarea + record button (existing `VoiceComposer` pattern).
- Submit → `supabase.functions.invoke('ingest-system-rule', { body: { text or audio } })`.
- Lists active rules below (queries `system_intelligence_kb` scoped to active workspace), with toggle to deactivate.
- Owner-only (gate via `useUserRole` + `useWorkspace.activeWorkspace.role === 'owner'`).

Mount the card inside `KnowledgeBase.tsx` above existing sections.

## 4. Hierarchy & efficiency

- `signal_priority`: `directive=3, negative=2, positive=1`.
- Owner-authored rules get `weight=2.0`; tenant rules `weight=0.5`; learned (approval/edit) rules `weight=1.0`.
- `fetchSystemRules` caps at 8 rules, ~600 tokens total.
- In-memory LRU survives across edge invocations within the same isolate (best-effort); cache TTL 30s.
- The `#CRITICAL_SYSTEM_PREFERENCES` block is injected **after** persona/KB context and **before** user task — it wins the recency battle without rewriting any prompt.

## 5. Out of scope (explicit)

- No new approval-queue UI (we already have it; we only emit reinforcement signals).
- No retraining of base models — this is prompt-time conditioning.
- No automatic rule deletion; owners deactivate manually or set `expires_at` via the UI later.
- No per-channel rule split — rules apply across post/comment/chat/voice surfaces uniformly.

## Files

New:
- `supabase/migrations/<ts>_system_intelligence_kb.sql`
- `supabase/functions/ingest-system-rule/index.ts`
- `supabase/functions/_shared/system-rules.ts`
- `src/components/strategybank/SystemRulesInput.tsx`
- `.lovable/memory/features/system-intelligence-kb.md`

Edited (small, additive):
- `supabase/functions/_shared/persona.ts`
- `supabase/functions/_shared/wa-companion-router.ts`
- `supabase/functions/whatsapp-webhook/index.ts`
- `supabase/functions/ayrshare-post/index.ts`
- `src/pages/KnowledgeBase.tsx`
- `.lovable/memory/index.md`

Confirm to proceed and I'll ship the migration first, then the edge functions and UI.
