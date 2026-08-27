# Realtyz AI — Architecture, Agent Psychology & UX Audit
Date: 2026-08-27 · Scope: conversational flows, AI agents, production coupling · Read-only audit (no code changed)

---

## 1. End-to-End Flow & Friction Audit

### 1.1 Inbound WhatsApp → AI reply (highest fragility)
| # | Finding | Evidence | Impact |
|---|---|---|---|
| F1 | Webhook races the **entire** AI generation against a 15s timeout inside the request handler | `meta-wa-webhook/index.ts:384-387` (`Promise.race([trigger, setTimeout(15000)])`) | Slow model → Meta retries the delivery → duplicate processing / duplicate replies |
| F2 | Per-message serial chain of 6+ Supabase round-trips before the model is ever called | `meta-wa-webhook:170-390`, `ai-agent/index.ts:192-332` | 1-3s of pure DB latency added to every reply |
| F3 | If `upsert_lead_from_interaction` fails, processing continues with `leadId=null` and `record_interaction_message` silently no-ops | `meta-wa-webhook:214-219`; RPC `…020220:108-110` | Inbound message is **lost** with only a console log |
| F4 | `record_interaction_message` uses `ON CONFLICT DO NOTHING`; callers can't distinguish "stored" from "deduped" | migration `…020220:118-119` | Genuine messages can vanish invisibly |
| F5 | `greenapi-webhook` returns 200 and drops every message by design, with no UI signal | `greenapi-webhook/index.ts:1-18,80-88` | If a legacy Green API session is still bound, messages appear delivered and never arrive |
| F6 | Media path runs 3 sequential gateway calls (fetch → transcribe → categorize) instead of parallel | `whatsapp-webhook/index.ts:278-387` | Voice notes reply 2-4x slower than text |
| F7 | Lead-metadata extraction failures swallowed with `console.warn` | `whatsapp-webhook:194-197,234-236` | Budgets/names silently never written |

### 1.2 Autopilot dispatch
- **Fully serial batch**: BATCH_SIZE=25 drained one job at a time (`autopilot-queue-drain:65-168`) → 30-50s per cron tick; a burst of leads waits minutes.
- **Unbounded backoff**: `60_000 * 2^attempts` with no cap (`:156`) → stuck jobs can be scheduled days out, visible only in `last_error`, surfaced in no UI.
- **Ambiguous failures**: `await res.json().catch(() => ({}))` (`:123`) turns malformed errors into "unknown" rather than hard failures.
- **Misleading consent UX**: `process-activity-queue:236-273` WhatsApps the owner asking to approve the next batch, but `:219-228` schedules the next wave on a 10-minute timer regardless of any reply. Nothing listens for the answer.

### 1.3 Voice-to-text
Healthiest leg. `transcribe-audio` surfaces typed errors (`:95-118`). Gaps: `useVoiceRecorder.stop()` awaits the full transcription with no cancel affordance (`:116-132`); deprecated `ScriptProcessorNode` (`:91`).

### 1.4 CRM lead creation
- `upsert_lead_from_interaction` invents a synthetic phone `'new-'||epoch` when none exists (`…020220:53`); **no caller special-cases this pattern**, so placeholder leads flow into the CRM and into outbound queues.
- `leadIntake.ts` returns no confidence signal, so a mis-parsed name/budget is written as fact (`ai-agent:261-263`).
- Dedupe uses `ilike`/token matching (`ai-agent:269-298`) — near-duplicate leads are a live risk.

### 1.5 Social / group publishing
- `meta-publish:233-293` uploads up to 10 photos **serially**, each with a 2-call Graph fallback → 10-20s with no progress UI.
- Idempotency is a JS-side content-hash scan over `campaign_logs` (`:354-397`), not an atomic DB constraint → double-click can still double-post.
- `fb-groups-import:117-145` is O(tokens × nodes × 2 fieldsets × 2 adminOnly × 10 pages) sequential Graph calls with `catch {}` at `:47,63,138`; partial token failures are invisible.
- Systemic pattern: **HTTP 200 with `ok:false`** (`brightdata-balance:99-131`, `fb-groups-import:108-112,180`) — any caller checking `res.ok` treats failure as success.

### 1.6 Bright Data / Yad2
- `yad2-unlocker.unlock()` retries 4× with growing backoff (`:233-312`) → several seconds per URL, invoked synchronously from user-facing flows.
- Zone-broken flags cached at module level with **no invalidation** (`:204-209`) → a transient misconfig degrades the whole isolate until cold start.
- `fetch-property-all-images:219-227` mirrors up to 40 images **one at a time** (12-20s), folding per-image failures into a counter (`:74-77`) and silently hot-linking the rest.
- `propertyFullSync.runMetadataSync:99-150` fakes determinate progress against a 12s assumption while awaiting a 60s timeout; `withTimeout:92-97` collapses "timed out" and "found nothing" into the same `null`.

---

## 2. AI Agent Psychology & Persona Alignment

### 2.1 What is already strong
Layered architecture is sound: `masterAgentPrompt.ts:195-215` (trust mode resolved **server-side** from JWT + `user_roles`, `:54-132` — correct) → `persona.ts` voice/stage-hat/deal-type overlays → `system-rules.ts` owner hard-laws with vector KB retrieval. Psychology rules (one question at a time, no fake urgency, no unverified facts, no em-dashes) are explicit at `masterAgentPrompt.ts:141-148`.

### 2.2 Persona drift — three sources of truth
| Path | Identity source | Stage hats | Verdict |
|---|---|---|---|
| In-app assistant `ai-agent` | `loadAgentPersona` + `persona.ts` (DB-driven) | Yes | Canonical |
| WhatsApp fast lane `waFastReply.ts:54` | **Hard-coded** "העוזר האישי של אודי ויטמן" | No | Cross-tenant leak risk; no BANT/negotiator switching |
| `outreach-suggest:77-81` | Ad-hoc Hebrew string | No | Thinnest, weakest voice |

Consequence: the same agent sounds different on WhatsApp vs in-app, and WhatsApp — the highest-converting channel — is the **only** one without stage-aware selling behavior (`persona.ts:194-284` unused there).

### 2.3 Model fleet is a full generation behind
- `google/gemini-3-flash-preview` — 12 call sites (`waFastReply:23`, `ai-agent:1692`, `extract-property:77,209`, …)
- `google/gemini-2.5-flash` — ~20 call sites (`ai-agent:1775`, `outreach-suggest:91`, `whatsapp-webhook:179,315`, …)
- `gemini-2.5-flash-lite` — `learn-from-edit:33`, `ingest-system-rule:70`
- `gpt-4o` **off-gateway** — `vapi-outbound-call:61`; `openai/gpt-4o-transcribe` — `transcribe-audio:13`
- Zero usage of `gemini-3.7-flash`, `gemini-3.1-pro-preview`, `gpt-5.6-*`. No reasoning-tier model anywhere, including `strategy-brief` / `executive-summary` where it would pay off.
- `whatsapp-webhook` mixes 2.5-flash and 3-flash-preview **within one file**.

### 2.4 Hebrew NLP & entity extraction gaps
- Phones: strong (`leadIntake.ts:43-81`), but the last-resort bare 9-10 digit match (`:76-79`) can capture IDs/prices.
- Cities: fixed 26-item `CITY_LIST` (`:83-88`), no fuzzy matching — "הרצליה פיתוח" is not in it despite being core territory.
- Budget: bare numbers <100 always resolve to millions (`:118`); out-of-range values are silently dropped (`:104-131`) rather than flagged.
- Gender: suffix heuristic `/(ית|ה|ת)$/` (`:311-331`) mislabels many male Hebrew names outside the ~60-name list → wrong grammatical gender in replies, which reads as amateurish in Hebrew.
- `compute-lead-score` is bag-of-words keyword counting (`:46-58`), language-mixing-blind.

### 2.5 Output hygiene — sanitizers exist but are barely wired
Sanitizers: `replySanitize.ts:5-51` (server) applied at **one** site (`waFastReply:121`); `chatTextSanitizer` + `ChatMessageText` applied at **one** site (`OmnichannelInbox.tsx:1244`).

Rendering raw AI content with **no** sanitizer: `AiAgentDrawer.tsx:589`, `SidebarIntelInput.tsx:252`, `RecentConversations.tsx:107,144`, `VoterProfileSidebar.tsx:238`, `ActivityLog.tsx:193`, `KnowledgeBase.tsx:674`, `LiveConversations.tsx:419`, `SuperAdmin.tsx:411`, and `PublicListingPage.tsx:143` (raw `ReactMarkdown` — a third, public-facing pipeline). `outreach-suggest:102-104` writes unsanitized model output straight into the approval queue.

---

## 3. Safety & Non-Regression Guardrails

| Item | Coupling | Blast radius | Safe-change rule |
|---|---|---|---|
| `autopilot_queue` columns | `leads_speed_to_lead` trigger, `queue_autopilot_messages`, `claim_autopilot_jobs`, drain worker | Autopilot stops sending or throws on every lead insert | Never rename; add nullable-with-default only; update trigger + RPCs + worker in the same migration |
| `interaction_activity_log` insert shape (`user_id, thread_key, platform, action_type, actor_type, actor_label, content, metadata`) | new trigger, `ai-agent`, `send-message`, timeline UI | Trigger failure swallowed by `EXCEPTION WHEN OTHERS` → silent timeline gaps | Treat as public contract; grep all writers before touching |
| **`leads_speed_to_lead` (new) has no idempotency guard** | Fires on every `AFTER INSERT ON leads` | CSV imports, merge jobs, `delete_leads_cascade` re-inserts → duplicate greetings to real clients | Add unique `(lead_id, template_id)` on `autopilot_queue` **before** touching any lead-insert path |
| Duplicate `messages` triggers `trg_queue_prospect_score_recompute` + `trg_queue_lead_score_recompute` | Two HTTP scoring calls per message | Wasted invocations; scoring logic must be kept in sync in two places | Confirm canonical scorer, drop the stale trigger |
| `messenger_page_bindings` (`page_id, page_name, page_access_token, owner_id, updated_at`) | `resolveMetaPage`, `ownerForPage`, `meta-page-connect`, `ensurePageToken`/`cachePage` | One rename = **simultaneous** outbound + inbound Meta outage | Validate all 4 sites together; don't rely on "latest row wins" if multi-page becomes valid |
| `META_GRAPH_VERSION` + `/me/accounts` shape | `meta-publish:145-174` | Silent stale-token fallback → cryptic publish failures | Pin the version; never bump alongside unrelated prompt work |
| `verify_jwt=false` on all 13 provider webhooks (`config.toml:1-49`) | Meta/GreenAPI/Resend handshakes | Flipping any to `true` in a "harden everything" pass breaks the channel instantly | Treat the list as an explicit allowlist; add in-function signature checks instead |
| Bright Data env chain (`BRIGHTDATA_UNLOCKER_ZONE`→`BRIGHTDATA_ZONE`→`reatyz_yad2`, separate `BRIGHTDATA_WS_ENDPOINT`) | `yad2-unlocker`, `yad2-ad-status`, `scrape-yad2` | Misconfig = silent 200-empty (`client_10090`) + cached short-circuit for the isolate's life | Never repurpose these vars; new products get new names |
| Zone list duplicated: `yad2-search:81` vs `yad2-unlocker:43` | Hand-maintained twice | Search and scrape silently target different areas | Extract to `_shared/` before the next edit |
| `workspace_whatsapp_settings` | **Zero** literal references in edge functions | Any logic assuming it gates WhatsApp is a no-op today | Confirm alive/dead before building on it |

---

## 4. Recommended Implementation Order (all non-breaking)

**Wave 1 — safety, no behavior change**
1. Unique constraint `(lead_id, template_id)` on `autopilot_queue` + `ON CONFLICT DO NOTHING` in `trigger_speed_to_lead()`. Kills the duplicate-greeting risk.
2. Drop the redundant `messages` scoring trigger after confirming the canonical scorer.
3. Reject/flag `'new-%'` placeholder phones before any outbound send.
4. Extract the Yad2 zone list into `_shared/yad2Zones.ts` and import in both callers.

**Wave 2 — output hygiene (pure presentation)**
5. Apply `sanitizeChatText`/`ChatMessageText` at the 9 raw render sites; route `PublicListingPage` through it instead of raw `ReactMarkdown`.
6. Wrap `outreach-suggest` output in `sanitizeReplyText` before it hits the approval queue.

**Wave 3 — persona unification (prompt-only, no schema/token changes)**
7. Make `buildFastReplyPrompt` accept the `loadAgentPersona` result; remove the hard-coded "Udi Witman" identity string and pass it in per workspace.
8. Wire `renderStageHatBlock` (BANT / matching / negotiator / nurture) into the WhatsApp fast lane — the single biggest conversion lever available.
9. Fold `outreach-suggest` onto the same `persona.ts` renderers so all three surfaces share one voice.

**Wave 4 — models & latency (config-level)**
10. Migrate `gemini-3-flash-preview` → `google/gemini-3.7-flash`; `gemini-2.5-flash` → `gemini-3.7-flash` or `gemini-3.1-flash-lite` for the cheap classifiers. One file per PR, verified with a real request each.
11. Put `strategy-brief` / `executive-summary` on a reasoning-tier model.
12. `Promise.all` the pre-model DB reads in `ai-agent`; parallelize photo upload (`meta-publish`) and image mirroring (`fetch-property-all-images`) with a concurrency cap of 4.
13. Replace the 15s race in `meta-wa-webhook` with ack-then-`EdgeRuntime.waitUntil` + a queue row, so Meta never retries.

**Wave 5 — Hebrew NLP precision**
14. Replace `CITY_LIST` with a gazetteer + fuzzy match incl. neighborhoods ("הרצליה פיתוח").
15. Return a confidence score from `leadIntake` and route low-confidence extractions to the approval queue instead of writing them as fact.
16. Drop the gender suffix heuristic in favor of gender-neutral phrasing when the name is unknown.

**Do NOT touch:** webhook `verify_jwt` flags, `messenger_page_bindings` columns, `META_GRAPH_VERSION`, Bright Data env var names, `autopilot_queue`/`interaction_activity_log` existing column names.
