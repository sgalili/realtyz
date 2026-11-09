# TORAFF — Automation pacing, rate limiting and safety audit
**Audit date:** 9 November 2026, 00:19–00:24 UTC  
**Scope:** checked-in application, browser worker, messaging/AI queues, SQL claim logic; read-only live schedule, counters and current post-claim function. No production sends or automation changes.

## 1. Executive summary
**Assessment: significant reliability and account-risk gaps; not ready to certify high-volume unattended operation.** There are meaningful safeguards, including encrypted sessions, atomic post claims, posting attempt caps, consent checks and selective pause controls. However, those protections do not cover all actions or all entry points consistently.

Most urgent findings:
1. Cloud social callbacks omit the workspace field required by the receiving handler. This prevents reliable lead ingestion and delivery reconciliation for the checked-in worker.
2. A private-response configuration dispatches a public comment reply. Keep automatic replies disabled until channel/consent and callback round trips are validated.
3. Campaign queue selection is not an atomic claim, creating duplicate-send risk under concurrent requests.
4. GoLogin is used for login, but the checked-in execution worker starts fresh Puppeteer browsers without connecting to that profile or its proxy. Israeli execution IP and session continuity are not demonstrated.
5. The 100/day rule applies only to cloud group-post attempts per workspace, not to every action per real Facebook identity. Comments, messages, joins and reads are outside this ledger.
6. Queue leases, report loss and click-based completion can produce duplicates or false success. Intended enqueue pacing can collapse when backlogs drain.

**100 actions/day is neither a verified platform-wide limit nor a Facebook-approved safe threshold.** “Human-like” typing or random delays cannot guarantee safety, policy compliance, or immunity from restrictions. Use permitted integrations and user-authorized activity; stop on challenges rather than attempting to evade them.

## 2. Method and evidence levels
- **Code-confirmed:** present in the repository; external deployments may differ.
- **Live-confirmed:** read-only current database function definitions, schedules and aggregate history.
- **Unverified:** deployed Railway worker version, provider tier/quotas, actual Facebook outcomes, GoLogin execution IP, rate-limit response handling under load, and all-account accounting.
- No Facebook, Messenger, WhatsApp, SMS or email messages were sent. No load test, checkpoint recovery or live duplicate-reproduction test was performed.
- Existing older audit documents were not treated as current architecture evidence.

## 3. Live observations
Collected around 00:20–00:22 UTC on 9 November 2026, from aggregate/read-only queries.

| Observation | Result | Meaning |
|---|---|---|
| Cloud poster schedule | every 5 minutes; active | Dispatch is scheduled, not proof of successful Facebook execution |
| Activity queue schedule | every 5 minutes; active | Separate from the cloud worker's action pacing |
| Scheduled post dispatcher | every minute; active | High trigger frequency is not itself high action volume |
| Autopilot retry schedule | minute 7 of every hour; active | Checked-in “every minute” comment does not match this installed retry job; event-driven wake paths may also run |
| Prior 24h scheduler records | cloud poster 288/288, activity 288/288, scheduled dispatcher 1440/1440, autopilot retry 24/24 marked succeeded | These confirm cron execution records only; HTTP/provider success is not established |
| Cloud run ledger, prior 24h | 288 rows; processed/dispatched/deferred/failed totals all zero | Idle tick evidence, not a throughput or successful-delivery test |
| Activity queue created in prior 7d | no rows | No recent queued activity to analyze for real pacing |
| Autopilot queue created in prior 7d | no rows | No real backlog/dispatch-spacing sample |
| Facebook post-attempt ledger, prior 7d | no rows | No empirical evidence of sustained 100/day operation |
| Current saved cloud sessions | one connecting, one linked remote profile, none reported expired | No active session observed in this snapshot; linked profile is not proof of healthy Facebook login |
| Cloud engagement settings | no rows | Not evidence that other auto-reply settings are disabled |
| Speed-to-lead settings | two records: greeting/follow-up on, 120-minute follow-up; quiet hours 22–08 | Configuration only; enforcement varies by path |

The live definition of `fb_claim_cloud_group_post` confirms a workspace advisory lock, 100 workspace attempts/day, 35 inferred-page attempts/day, Asia/Jerusalem day boundary, and a 180–420 second claim-time gap. It has a 10-minute lease and increments attempts on claim. There is no claim-time rolling-24-hour limit, and no shared accounting of messages/joins/comments.

Other active schedules observed: follow-up drip every 30 minutes; matcher every 15 minutes; group pool rebalance hourly; owner CRM sync hourly at minute 35; greetings daily 06:00; lease/listing availability checks daily 07:00; tour feedback hourly at minute 10; tour reminders every 5 minutes. These are cron expressions, not localized display times. Yad2 windows are checked separately in Asia/Jerusalem by `claim_market_scrape_slot`, allowing local hours 08 and 18 and one source/day/window claim.

## 4. Practical pacing assessment
- Group-post claim spacing of 3–7 minutes is a useful burst guard, but starts at reservation rather than verified execution. Per-process serialization does not extend across replicas or workspaces sharing an identity.
- 100 actions spread over 12 hours averages **7 minutes 12 seconds/action**; over 16 hours averages **9 minutes 36 seconds/action**. These are arithmetic examples, not recommended or guaranteed-safe provider limits. Daily ceilings must be combined with rolling short-window budgets, actual execution spacing and permitted-use checks.
- First comments and replies are separate side effects. A post plus a first comment consumes more than one real action even though the current ledger reserves one post attempt.
- Fixed UI waits (4s initial, 3s composer, 1.5s pre-submit, 8s post-submit; 8–10ms/character typing) are rendering waits, not evidence of human-like behavior or throttling across tasks.
- Replies should prioritize genuine inbound requests with per-conversation ordering and debounce; proactive broadcasts need separate consent, recipient frequency caps and sending windows.
- Do not increase throughput to consume a cap. Cap is a maximum internal guard, not a daily target.

## 5. Priority remediation and acceptance criteria
| Priority | Recommendation | Acceptance evidence |
|---|---|---|
| P0 | Repair authenticated job-bound callback workspace/event/message correlation; verify HTTP result and persist callback retries | Realistic callback payload accepted; replay idempotent; failed callback recovered without resending external action |
| P0 | Separate public comment responses from private outreach; mark accepted, dispatched and delivered distinctly | Private setting never publishes publicly; only verified delivery increments success counters |
| P0 | Atomic campaign claims and stable provider idempotency/reconciliation | Two simultaneous consumers cannot send the same job twice; timeout-after-send enters uncertain state |
| P1 | Distributed canonical provider-identity/actor limiter across workspaces and all action types | One shared identity has one execution lane, atomic budget and enforced execution-time next slot |
| P1 | Choose and verify browser-runtime continuity; actor and checkpoint checks before each action | Actual job uses the intended runtime/session; browser actor and healthy connection verified; challenges stop all relevant tasks |
| P1 | Durable queue, fencing, lease renewal, bounded global concurrency and callback outbox | Restart/slow worker/replica tests show no stale completion, lost accepted jobs or unbounded launches |
| P1 | Common provider cooldown honoring Retry-After; bounded exponential backoff and dead-letter handling | Injected 429 stops all consumers of that identity; permission/challenge errors do not trigger blind retries |
| P1 | Define AI off, campaign pause and all-automation emergency stop separately; fail closed for proactive traffic | Each outgoing family respects its specified stop immediately before transmission, including lookup failure |
| P2 | Recoverable engagement/event claims; stable external IDs and per-conversation reply queue | Duplicate webhook/snapshot cannot reply twice; crashed pending/sending records recover safely |
| P2 | Monitor outcomes, queue age, execution spacing, account budgets and session health, without message bodies or secrets | Alerts for stuck leases, unexplained zero delivery, duplicate provider IDs, callback failures and checkpoint rate |

## 6. Rate/operation policy recommendations
Define budgets per actual sending identity, traffic class and destination, not only workspace. Include attempted and ambiguous actions to avoid runaway retries; distinguish successful outcomes for reporting. Add short-window and recipient/group caps as well as calendar and rolling-day budgets. Reserve before delivery, then enforce execution pacing and reconcile. Honor provider-defined quotas and permission requirements; choose initial production caps only after reviewing provider/account restrictions and a nonproduction recovery test. There is no universal safe numerical rate to prescribe from this repository.

Avoid sleeping through long batches inside request handlers: reschedule next eligible jobs instead. Size leases/visibility to execution plus queue-wait time, renew them, and fence every completion. Reuse permitted session/runtime safely rather than launching unbounded browsers. Do not use proxy rotation or randomized behavior to bypass platform enforcement.

## 7. Additional safety/security screening
The quick database safety scan completed on 9 November 2026 at 00:19 UTC: **12 warnings and 11 informational findings; no error-severity findings in that quick scan**. This is not a clean-security certification. Warning categories include unchecked public inquiry/demo inserts, broad signed-in writes, broad cache/run reads, and media access rules. Some public lookup/branding reads may be intentional and need contextual review; scanner results alone do not establish exploitation. No findings were dismissed or marked fixed during this audit.

A separate deep code security scan was started and **is still pending when this report was prepared**; its results are not included. Infrastructure connector screening was skipped because that connector is not configured. Provider policy and external worker deployment are outside the quick scan's scope.

## 8. Verification performed and limits
15 existing cloud group policy/discovery tests passed (`src/lib/cloudGroupPolicy.test.ts`, `src/lib/cloudGroupDiscovery.test.ts`). They cover policy/discovery helpers, not end-to-end delivery, production rate safety or every limiter. Live post-claim functions and schedules were read, and current aggregates were checked. No application code, backend configuration or sending limits were changed.

## 9. Detailed source-cited technical findings
The appendices below preserve the read-only source reviews. Their original scope notes describe the reviewers' static-only access; Sections 2–3 above add the separately collected live evidence. **Correction to queue appendix:** its broad “no daily budget” finding means no universal cross-channel budget; the current cloud group-post path DOES have the live-confirmed 100/35 attempt caps. Older `supabase/migrations` definitions may be historical; only the explicitly read live functions and latest Drizzle overrides are runtime-confirmed here.


### Appendix A — Browser execution review

# TORAFF browser/cloud audit

## Scope and confidence
Read-only static audit of `cloud-runner/index.js`, `groupPolicy.js`, `README.md`, Facebook session vault, group manager, cloud post dispatcher and social callbacks, their shared GoLogin/reply helpers, and relevant database migrations. No project files changed; no Facebook actions, live deployments, credentials, or databases accessed. Source paths and line ranges below are repository-relative. Migration behavior is conditional on those migrations actually being applied; deployed worker versions, platform gateway authentication, cron configuration, Facebook UI behavior, and external policy compliance were not verified. These are code findings, not claims that Facebook permits a particular daily rate.

## Executive assessment
The latest checked-in policy is **100 cloud group-post attempts per workspace per Israel calendar day, 35 per inferred page**, not 100 total Facebook actions per real account. Hash-derived 180–420 second spacing is enforced at database claim time, not actual browser execution. The most immediate functional defect is that social callbacks omit their required workspace identifier, so inbox/comment processing fails. Even after that is corrected, acceptance is mistaken for delivery and a private-comment-reply setting produces public replies. GoLogin handles login and cookie extraction, but actual jobs run fresh local Puppeteer browsers without the GoLogin profile or its proxy.

## Serious findings

### 1. HIGH — Social callback contract is broken for every social job
**Evidence:** `cloud-runner/index.js:133–147,199–200` constructs callbacks containing action, job_id, optional dispatch_token, and action result. It does not include `workspace_owner_id` or message correlation. `supabase/functions/cloud-social-inbox/index.ts:74–87` requires workspace_owner_id for inbox_result, comments_result and send_result and returns HTTP 400 otherwise. None of the corresponding runner results supplies that field (`index.js:248,272,304,328`).
**Impact:** scans may execute, but callback ingestion, lead capture, generated Messenger responses, send reconciliation and social session-expiry handling cannot work through this runner contract. `report` ignores HTTP response codes (`index.js:138–147`), so the rejection is invisible and not retried.
**Remediation direction:** include an authenticated, durable job-bound workspace and message/event correlation in callbacks; verify response status; retry callbacks idempotently. Do not enable dependent automation until round-trip tests cover the actual payload.

### 2. HIGH — “Account limits” are workspace post-attempt limits, not an identity-wide action budget
**Evidence:** latest replacement `drizzle/migrations/0094_fb_per_page_post_capacity.sql:15–40` locks/counts by workspace_owner_id; limits are 100/day across the workspace and 35/day per inferred page. `:4–9` infers page from payload, target group, selected binding, or literal `account`. Previous 35-account policy in `0093_fb_account_daily_post_cap.sql:16–43` is superseded by 0094, assuming applied. `cloud-runner/groupPolicy.js:1–2` defines 100 active and 200 reserve **groups**, not actions; only its answer/outcome helpers are imported (`index.js:17`).
**Impact:** one real Facebook identity connected to multiple workspaces can exceed the nominal account budget and run concurrently. Joins, Messenger sends, public comment replies, first comments, reads and discovery are not recorded in the cloud post-attempt ledger (`cloud-social-inbox/index.ts:39–49`; `fb-group-manager/index.ts:81–89`). Thus “100 actions/day” is false. With one inferred page bucket, the effective post-attempt ceiling is 35, not 100. Neither ceiling is evidence of Facebook safety or permission.
**Safeguard:** post claims count failures and accepted-but-not-executed claims too, and workspace locking prevents simultaneous claims bypassing those counters. Day boundary is Asia/Jerusalem, not rolling 24 hours (`0094:21–40`).

### 3. HIGH — Quota page identity is not enforced in the browser
**Evidence:** `0094:4–9,22,40` assigns quota buckets by inferred page. `cloud-group-poster/index.ts:159–170` does not send that page/actor to the runner. `cloud-runner/index.js:58–127` restores cookies and posts without selecting or verifying a Page identity. Page is inferred before `fb_prepare_cloud_group_post` may rotate the target (`0094:22,37–40`; `0053_cloud_post_rotation_and_live_sessions.sql:14–16`).
**Impact:** the actual logged-in actor may differ from the charged page. Three page buckets could permit up to 100 attempts attributed across pages while one session identity actually performs them. Posting to the wrong actor or rotated destination is possible without verification. This is an accounting/identity mismatch, not proof that Facebook accepts page switching.

### 4. HIGH — Serialization and jitter do not ensure account-wide execution spacing
**Evidence:** runner lanes are process-local Promises keyed only by workspace (`index.js:333–345`). All different workspaces can launch browsers concurrently; there is no global worker cap, queue-size limit, durable queue or job-ID dedupe (`:416–442`). Joins wait 120 seconds **after report**; posts and social jobs have no analogous inter-job sleep. Latest SQL gap is deterministic hash jitter of 180–420 seconds measured from claim/attempt time (`0094:31–40`), not completion/start of the Facebook action. Join claim locking is workspace-only and separate from post claims (`0054_atomic_cloud_post_and_join_claims.sql:1,4`).
**Impact:** replicas/restarts bypass in-process serialization; one identity in two workspaces has two lanes. Backlogged claims can execute consecutively even though their claim timestamps were spaced. A 10-minute lease starts before time in the lane, so a valid waiting job can be reclaimed while still queued. With many workspaces there is unbounded browser/resource pressure.
**Safeguards:** within one running process all action types share a workspace lane; join delay is 2 minutes plus execution/report time. SQL advisory locks make individual post/join claims atomic. Neither is a distributed identity lock.

### 5. HIGH — At-least-once dispatch without side-effect dedupe permits duplicate posting
**Evidence:** worker acknowledges 202 before work (`index.js:440–442`), retains only in-memory lanes, and does not persist job acceptance/dedupe. Post dispatcher resets expired processing leases after 10 minutes (`cloud-group-poster/index.ts:78–84`); callback updates only status=processing and lacks dispatch attempt token (`:48–64`). Join recovery rotates its token and guards callbacks (`fb-group-manager/index.ts:27,55–63`), but that cannot cancel old queued browser actions. Reports have no timeout, response-code verification or durable retry (`index.js:133–147`).
**Impact:** callback loss, restart, timeout-after-acceptance or queue wait can cause a second real action; a stale post callback can finish a newer attempt. Reports arriving after lease reset may update no queue row but still call outcome recording, which updates the newest pending ledger row (`0093:46–49`). A hung report can block a lane indefinitely.
**Safeguards:** posting preflight includes per-listing/per-group dedupe and excludes nonfailed duplicate targets when rotating (`0053:8–16`); this is not external Facebook side-effect idempotency. Joins distinguish already-joined/pending UI and require current token/status on callback.

### 6. HIGH — Retry budget is inconsistent; failures are not uniformly recoverable
**Evidence:** `cloud-group-poster/index.ts:25–27,149–153,180–195` defines max attempts=3, re-reads the claimed row whose counter was already incremented (`0094:38`), then adds 1 again in its dispatch-error branch. First transport failure sees counter 1 but computes 2; second sees 2 and computes 3, stopping after two dispatch failures. Retriable transport errors get a fixed 15-minute deferral. Browser-reported failure is immediately terminal (`cloud-group-poster:50–62`), while expired lease recovery has no max-attempt condition (`:78–84`). Join dispatch failures become failed (`fb-group-manager:93–96`); requested joins are eligible for hourly polling (`:28,61`), with no attempt ceiling in claim SQL (`0054:1`).
**Impact:** some transient errors stop too soon; repeated missing callbacks can retry indefinitely across days and duplicate side effects. A successful post followed by comment error can fail the entire job without preserving the already-completed post.

### 7. HIGH — Success is inferred from clicks; partial failure is erased
**Evidence:** `index.js:105–127` clicks Post, sleeps 8 seconds and returns current page URL without verifying publication, moderation state or a new post permalink. Images sent by the dispatcher (`cloud-group-poster:165`) are never consumed by publish. Optional first comment uses a page-wide selector and is silently omitted if no box appears (`index.js:112–124`). Messenger and comment replies return completed after Enter and 2.5 seconds, without delivery confirmation (`:252–272,308–328`); reply fallback textbox is not scoped to the selected comment (`:325`).
**Impact:** failed/pending posts appear completed; images are lost; comments can target another visible post/textbox; successful posts plus failed first comments cannot be safely resumed. runner_note may be a group URL, so later comment scans may scan an unrelated feed instead of the published post (`cloud-social-inbox:55–60`). Require separate publish/comment/media outcomes and verified external identifiers rather than retrying the entire operation.

### 8. HIGH — GoLogin login/proxy promises do not describe job execution
**Evidence:** `fb-session-vault/index.ts:185–216` provisions/launches a GoLogin profile and attaches an Israeli proxy; `:257–278` fetches a selected Facebook cookie subset, marks active when c_user/xs exist, and gives a fixed 25-day expiration. Actual actions use local `puppeteer.launch`, cookies and optional UA only (`index.js:58–67,150–158,202–209,350–359`). No GoLogin remote browser connection, profile ID, proxy, persisted fingerprint, storage or cookie refresh is used by those runtime paths.
**Impact:** login and jobs can have different IPs/fingerprints and lose browser storage/session updates, increasing challenges or invalid-session failures. Cookie presence is not a live login/checkpoint test. Fresh browsers are real, but GoLogin continuity/Israeli execution IP is not established. Publish/discovery detect `/login` only (`:74,365`), unlike social/join `/login|/checkpoint`; they do not expire the shared connection on challenge. Existing queued jobs are not revalidated against session status before running.
**Documentation:** README:32 broadly promises checkpoint pausing; that is not true for every path. README:37 says runner never stores anything, but jobs/cookies remain in its in-memory lanes and temporary browser profiles exist during use. README:19,26's minimal setup omits the callback-origin requirement later added at :30. No documentation here establishes durable execution or Facebook-approved automation limits.

### 9. HIGH — Private-reply setting triggers a public response; acceptance is marked as delivery
**Evidence:** `cloud-social-inbox/index.ts:123–148` uses `privateReplyConfig` and, when enabled, dispatches `comment_reply` containing its text. Runner `index.js:308–328` clicks the public Reply button and types into Facebook's comment textbox; it does not send a private message. `metaPrivateReply.ts:131–145` bases configuration on auto_dm_commenters and pause state. Engagement status becomes replied immediately when worker accepts, not when Facebook confirms (`cloud-social-inbox:147–148`).
**Impact:** copy configured for private outreach is published publicly, and failed sends appear replied. No keyword/intent filter, author-is-self exclusion, comment age check, per-author cooldown or cross-action budget exists in this cloud comment loop (`:132–148`). If scraped self-replies enter later scans, further automatic responses are possible; DOM behavior determines whether this occurs. Any contact details in configured copy are exposed publicly; no such data is reproduced here.
**Safeguard:** setting must be enabled and not paused; already-seen external comment IDs are skipped. That guard also means a failed initial dispatch will normally never retry, because the engagement event already exists.

### 10. MEDIUM/HIGH — Messenger dedupe and triggers are heuristic, not stable event processing
**Evidence:** inbox scrapes at most 10 discovered numeric threads, normally reads 8 and only the last 12 DOM rows, deriving direction from localized labels (`index.js:220–245`). Callback identity is thread + truncated SHA of text + occurrence count within the current snapshot, without Facebook message ID/timestamp (`cloud-social-inbox:98–108`). Only a newly inserted final inbound message invokes Rita (`:110–116`). `metaDmRita.ts:14–26` can enable autopilot when no explicit global flag is set unless the lead explicitly disables it; a pause guard exists.
**Impact:** repeated identical messages can be falsely suppressed or renumbered as the 12-row window slides; outbound classification errors can trigger self-replies. Older/missed messages, nonnumeric threads and inactive threads can be missed. Persistence before reply means an AI/send failure is not automatically retried on the next identical scan. Rita's dispatch callback returns success at acceptance (`cloud-social-inbox:113–115`), while its outbound message is recorded sent (`metaDmRita.ts:131–150`); no matching message_id is supplied to the worker. These paths are currently additionally blocked by finding 1.

### 11. MEDIUM — Poll throttling and comment ingestion are not atomic
**Evidence:** social tick checks a log row then dispatches and logs afterward (`cloud-social-inbox:53–62,155–165`); concurrent ticks race, and authenticated manual sync bypasses the 10-minute check (`:169–180`). Comment dedupe does SELECT then INSERT (`:136–144`), with lead/message writes outside a transaction. Comment scans inspect at most 10 completed posts from the last 14 days, up to 50 visible comments each, and scroll only three times (`:55–58`; runner:278–300).
**Impact:** duplicate scans/load, partial lead/event/message records and incomplete capture are possible. A database unique constraint may limit duplicate events, but these paths do not check every insert error or roll back related side effects. A 10-minute nominal cadence can enqueue up to 144 inbox scans/day plus comment scans per workspace; it is not a limit of 100 Facebook actions. Actual enqueue rate depends on cron, successful logs and backlog.

### 12. MEDIUM — Trusted worker surface lacks several failure/resource boundaries
**Evidence:** `index.js:426–442` requires a shared secret but accepts unlimited request-body/queue size and unvalidated job_type (unknown types fall through to publish at :339). Publish accepts arbitrary group_url (:69–71), whereas join/comment operations validate Facebook origins (:151–152,201,309). Callback URL origin/path is allowlisted (:135–137), but fetch follows redirects by default and carries the worker-secret header (:138–140). Post dispatcher tick lacks an in-handler caller authorization check outside the report branch (`cloud-group-poster:35–84`).
**Impact:** malformed trusted requests can cause unexpected publishing or resource exhaustion. Arbitrary publish navigation is a trusted-input SSRF/navigation risk, not an unauthenticated public exploit. Tick exposure depends on platform gateway/JWT settings: without an effective outer gate, callers can trigger due-work dispatch and downstream ticks with service privileges. Redirect handling should not permit secrets to leave the allowlisted endpoint. Shared-secret compromise has broad callback authority.
**Safeguards:** empty secret rejects worker requests; callbacks have exact origin/path allowlisting; join callbacks additionally use UUID token/status checks and schema validation. Session vault requires authenticated workspace access, rejects credential-style input and encrypts saved cookies (`fb-session-vault:35–36,81–98,274–278`).

## Concrete timing and capacity summary
- Group inventory: 100 active + 200 reserve/nonblocked per workspace (`groupPolicy:1–2`; `0052_cloud_group_join_and_pool_limits.sql:15,27–29`). This is not a daily action count.
- Latest cloud posting claims: 100 workspace / 35 inferred-page attempts per Asia/Jerusalem day; 180–420 s deterministic claim spacing; cap overflow scheduled next Israel day 08:00–08:59:59 (`0094:23–40`). All outcomes count, including failures before browser work.
- Post dispatch batch 5; 20 s dispatch HTTP timeout; 10 min lease; fixed 15 min transport retry/no-ready-group delay (`cloud-group-poster:25–27,176,190`; `0053:15`).
- Join: one SQL processing claim/workspace, 10 min lease; 120 s post-report worker delay; requested membership checked again after 60 min; tick considers at most 30 due jobs and one/workspace (`fb-group-manager:27–30,61`; runner:342).
- UI pacing is fixed: publishing initial 4 s + composer 3 s + pre-submit 1.5 s + post-submit 8 s, typing 8 ms/character, optional comment 4 s; Messenger initial 4 s, typing 10 ms/character, post-send 2.5 s; comments initial 4.5 s + 1.5 s before typing. No randomized human-like runtime behavior is implemented in these functions (`index.js:71–123,252–272,308–328`). Delays do not establish platform safety.
- Discovery: 6 scrolls × 1.2 s, max 60 results; memberships 40 × 1.2 s, max 300. It marks discovered membership links is_member=true rather than checking each group's leave/pending state (`index.js:361–405`). Vault upserts those as joined (`fb-session-vault:51–63`), so membership confirmation is weaker in bulk sync than the explicit join path.

## Existing safeguards worth retaining
1. AES-GCM session encryption, server-side cookie extraction and workspace authorization; no supported password/manual-cookie submission in vault.
2. Exact callback origin/path allowlist and shared-secret authentication; join schema/token fencing and conditional status updates.
3. Atomic SQL claims and per-workspace advisory locks; service-role-only claim functions; counting failed attempts toward daily quota.
4. Group join outcome separates requested from joined; explicit owner-provided question answers/rule consent; unsupported question types stop instead of inventing answers (`groupPolicy:3–10`; runner:174–195).
5. Blocked/overflow/session-expiry prechecks on joins (`fb-group-manager:73–82`), group pool rotation/readiness checks and per-listing target dedupe on posts.
6. Finally blocks close browsers; worker lanes survive an earlier rejected Promise; deployment capability probe verifies join support (`index.js:128–129,196,210,338`; `fb-group-manager:84–91`).
7. Fresh-inbound-only Rita trigger, explicit global-off and pause checks; opt-in comment auto-reply configuration. These do not fix missing callback correlation, unstable message IDs or public/private mismatch.

## Prioritized follow-up
**P0:** repair and test callback contract end-to-end; keep automatic replies disabled until verified. Separate public comment consent/configuration from private outreach. Do not label acceptance as sent/replied.
**P1:** introduce canonical Facebook identity/actor binding and distributed execution-time budget across workspaces and action classes; verify actor in browser. Persist jobs with attempt fencing and external side-effect checkpoints; handle ambiguous completion without blind republish. Fix retry double-counting and lease/queue interaction.
**P1:** explicitly choose GoLogin runtime continuity or disclose/use a different browser runtime; validate actual session health and pause every action class on checkpoint. Verify real post permalink/media/comment outcomes independently.
**P2:** atomically claim polling slots and comment/message events; use stable external event identifiers, durable callback outbox, bounded queue/global concurrency, timeouts and redacted observability. Document the latest workspace/page policy as an internal guardrail, never as Facebook-approved safety.

No patches applied. This is an audit, not a requested code fix; the follow-up list is design/remediation guidance rather than unvalidated replacement code. No tests were run because no code was modified and live browser execution would create external effects.

### Appendix B — Queues and messaging review

# TORAFF queue, scheduling and outbound safety audit

## Scope and evidence standard
Read-only repository inspection. No project files changed, no provider requests made, no credentials or personal data collected. References below are repository paths and line ranges. Findings describe **checked-in implementation/defaults**, not verified deployed behavior. No live database, `cron.job`, execution history, queue depths, deployed function versions, external browser worker implementation, provider quotas or delivery statistics were queried. Cron comments are explicitly not evidence of installed jobs. Migration ordering was considered where claim functions are replaced.

## Executive conclusion
**100/day safety is not guaranteed.** There is no demonstrated mandatory, atomic, cross-entry-point daily reservation ledger plus per-provider/per-sender serialization covering campaigns, autopilot, manual sends, engagement reminders, public replies and inbound DM AI. Batch sizes, future timestamps, UI caps and provider template approval are different controls, not account-safety guarantees. Even an enforced 100/day limit would not guarantee provider acceptance or prevent spam enforcement.

Highest risks: campaign duplicate sends under concurrent calls; backlog bursts despite enqueue jitter; inconsistent stop-switch semantics; expired leases without fencing/heartbeat; engagement failures permanently consumed by dedupe; inbound AI fan-out without a shared budget; cron deployment not reproducible from the inspected declarations.

## Pacing and execution inventory
| Path | Checked-in pacing/concurrency | Important limitation |
|---|---|---|
| Autopilot enqueue | `queue_autopilot_messages`: 30–60 second default random increments; accepts >=1 second minimum and <=5000 recipients per call | Each call starts its own timeline at now; neither sender-global serialization nor daily cap |
| Autopilot drain | 25 claims per invocation; sequential awaited sends, no inter-send sleep | All overdue rows can drain at network speed; overlapping invocations claim different batches |
| Scheduled posts | Select <=10 due rows, conditional row lock, 5-minute orphan timeout | Per-run cap, not sender/day or sender/minute cap; regeneration/provider latency can exceed lease |
| Campaign SMS/WhatsApp | <=500 rows default, <=1000 requested; sequential loop | No deliberate spacing; queued-row selection is not a claim |
| Campaign email | safe: 20 then random 30–120 seconds; slow: 10 then 60–300 seconds; burst: no delay | Request-selectable; no sender-global semaphore or shared cooldown |
| Transactional/auth email | 10 messages per queue default, 200ms inter-send, two queues; pgmq visibility 30 seconds | Multiple invocations can run; batch latency can outlast visibility |
| Engagement jobs | lease expiry 50, tour feedback 50, birthday 100, holiday 300; scheduler leases 240/300 seconds | Batch limits are not daily limits; jobs can overlap other messaging families |
| Activity queue | Reads 200 due; local workspace counter 5, intended 10-minute waves | Group jobs delegated to extension/cloud claims; comments at top overstate universal pacing |
| Extension SQL claim | default 2, max 5, 10-minute lease, max 3 attempts | Poll frequency and simultaneous consumers determine throughput, not a daily budget |

Sources: `supabase/migrations/20260430190457_aaebbf45-85e3-4c53-8297-5a16e69946bd.sql:53-145`; `supabase/functions/autopilot-queue-drain/index.ts:14-28,67-175`; `supabase/functions/scheduled-post-dispatcher/index.ts:43-44,252-359`; `supabase/functions/dispatch-campaign/index.ts:763-797,877-1028`; `supabase/functions/process-email-queue/index.ts:4-8,129-143,353-356`; `supabase/functions/process-activity-queue/index.ts:1-24,53-115`; `supabase/functions/engagement-greetings/index.ts:11-17,35,76`; `supabase/functions/lease-expiry-reminders/index.ts:10-25`; `supabase/functions/tour-feedback-followup/index.ts:10-32`; latest extension claim in `supabase/migrations/20261005221749_0f78cb93-d015-48ca-b711-f8a7e4c39ef2.sql:127-175`.

## Findings

### HIGH — Campaign queued rows can be sent twice
`dispatch-campaign/index.ts:789-797` selects `campaign_logs.status='queued'` without `FOR UPDATE SKIP LOCKED`, processing-state compare-and-set, lease, or atomic reservation. `:877-1028` performs external sends before updating individual rows. Two calls can read the same rows and both transmit. Crash/timeout after delivery but before status persistence permits another send. No provider idempotency key is passed by this campaign loop. Sequential execution in one request does not serialize two requests.

Email safe-mode sleeping increases request lifetime and the duplicate window. Completion writes must be checked, and uncertain delivery must be reconciled rather than automatically resent.

### HIGH — Autopilot timestamps do not impose actual dispatch spacing
Enqueue SQL `20260430190457…sql:53-105` staggers one batch only. Simultaneous batches overlap. Worker `autopilot-queue-drain/index.ts:23-28,67-135` claims 25 overdue jobs and sends immediately, sequentially but without wait or a next-sender-slot check. Downtime/retries therefore compress intended spacing into bursts. Nominal 25 jobs/minute (if invoked once/minute) is a per-run illustration, **not** a guaranteed throughput ceiling and already greatly exceeds 100/day.

Claim SQL `:110-126` correctly uses atomic UPDATE with `FOR UPDATE SKIP LOCKED`; this protects same-row ownership during an unexpired lease, not per-tenant/provider rate. No tenant fairness in claim ordering: one backlog can dominate.

### HIGH — Expiring locks are not fenced delivery ownership
Autopilot recovery `20260430190457…sql:129-145` requeues processing older than five minutes. Worker sends and finishes by ID only (`autopilot-queue-drain/index.ts:109-159,170-176`), without heartbeat or lock-owner predicate. Slow original workers can continue after another worker reclaims. Attempts increase on claim, including jobs merely deferred for pause/off (`:69-94`), not just actual failed sends.

Scheduled dispatch has conditional acquisition (`scheduled-post-dispatcher/index.ts:324-333`), but five-minute unlock recovery (`:252-257`) can similarly overlap slow regeneration/send. No universal heartbeat/fencing protection was found in these paths. Releasing a database lock cannot undo external delivery.

Scheduler lease SQL `20260915225939_6458efe0-d410-4096-a7d6-3ab7f5280f30.sql:27-64` atomically acquires leases and respects paused state. However release uses only job name, not worker/token: an expired old invocation can release a newer owner's lock. Shared `engagementJobs.ts:150-184` has no renewal.

### HIGH — Kill switches are inconsistent and not a mandatory gateway policy
Autopilot drain checks `is_ai_paused` plus `is_ai_autopilot_enabled`, caching once per tenant per run (`autopilot-queue-drain/index.ts:48-94`). Pause RPC errors coerce to false (fail open); enabled errors coerce false (fail closed). Changes during a batch are delayed by the cache.

Activity queue exempts scheduled group jobs from autopilot (`process-activity-queue/index.ts:84-105`). Latest extension claim SQL checks pairing, due time, blocked groups, attempts and listing cap but has no AI pause or universal owner stop check (`20261005221749…sql:127-175`). This exemption may be intentional for user-authorized sends, but it must not be presented as an all-outbound emergency stop.

Comment auto-replies explicitly OR global autopilot with sentiment switches (`auto-engagement-process/index.ts:199-211,315-321`); global off cannot override an enabled sentiment switch. No `is_ai_paused` guard was found in that function. Messenger uses a different rule: explicit global false wins, otherwise sentiment or lead defaults can enable; it checks pause (`_shared/metaDmRita.ts:14-29`). These are materially different meanings of “off.”

Shared engagement dispatch checks scheduler pause/lease, not a universal workspace AI pause (`_shared/engagementJobs.ts:91-130,150-184`). Direct send gateways must distinguish manual/transactional/proactive sources and apply the appropriate emergency policy immediately before delivery.

### HIGH — Engagement dedupe prevents retries after failed or interrupted sends
`_shared/engagementJobs.ts:91-130` inserts unique job/dedupe row before sending; any unique violation returns duplicate irrespective of pending/failed/sent state. Failed requests are marked failed but retain the key. A crash after claim and before delivery leaves pending permanently suppressed on later runs. A network exception can also leave pending. This is at-most-one-attempt behavior, not exactly-once delivery.

Unique log schema: `20260915230407_855e8dbc-0e89-4eb0-968d-7bc70ffb7305.sql:39-51`. The helper pauses the whole job on HTTP 402/403 (`engagementJobs.ts:115-129`), useful circuit breaking but broad across tenants. It tests HTTP status only (`:65-66,111`), so a provider/gateway logical failure returned as HTTP 200 is a potential false-success risk; verify the delivery contract. No shared 429 cooldown or exponential retry exists in this helper.

### HIGH — Inbound AI/public comment fan-out lacks shared pacing and atomic reply reservation
Messenger webhook ignores echoes and runs Rita only for newly persisted messages (`meta-dm-webhook/index.ts:95-118`): useful redelivery dedupe. However each distinct inbound message can independently invoke generation/send; different webhook requests can overlap for one lead/sender. `_shared/metaDmRita.ts:35-45,128-149` delivers immediately; no sender budget, per-conversation mutex, debounce or shared Retry-After mechanism is apparent there. Persist-before-reply means a failed reply can be skipped on redelivery rather than retried durably.

Comment processor checks existing sent/replied/sending/auto_reply rows (`auto-engagement-process/index.ts:176-194`), then performs AI work and persists sending (`:274-355`). This is a read-then-write guard, not an atomic processing claim. Concurrent calls that see an unprocessed existing row can both proceed. A stuck sending row is suppressed by the early return; no lease-based recovery is evident in this path. Self/AI event blocking is present (`:160-174`), but it is not a volume control. No aggregate cap covers comment replies plus DMs plus WhatsApp/SMS.

### MEDIUM/HIGH — Official transport is not a rate limiter
WhatsApp gateway enforces template/24h-window logic (`send-whatsapp/index.ts:900-930`) and classifies Meta rate errors (`:644-735`); it does not establish a common daily sender budget or pacing queue. Rate-limit classification alone is not a cooldown. Compliance/message logging is explicitly best effort (`:1073` onward). Campaign proactive WhatsApp requires approved templates (`dispatch-campaign/index.ts:814-833,900-940`); that is a messaging policy control, not permission to send at arbitrary volume.

SMS uses shared 019 transport (`send-message/index.ts:8,32-40,217,332`; `_shared/sms019.ts`): no common sender-global reservation/sleep/cooldown was found in that transport. `send-message/index.ts:52` accepts a `daily_limit` default 50 in an automation schema; that field is not itself an enforced common cap on actual SMS calls. Campaign SMS loops have no deliberate jitter.

Gmail campaign defaults 500/day or 2000/day for inferred Workspace accounts, with positive caller-configured account override (`dispatch-campaign/index.ts:259-309`). Account type inference from non-gmail domain is not verified quota evidence. Historical usage is distributed evenly with floor across accounts (`:840-869`), not attributed to the actual sending connection, and snapshots are not atomic reservations. Concurrent campaigns can overshoot; other Gmail entry points may not share accounting. Resend threshold 100 (`:334-339`) is a routing heuristic, **not a 100/day cap**.

### MEDIUM — Email queue is better hardened, but short visibility leaves overlap risks
`process-email-queue/index.ts:116-143` checks shared cooldown, reads batches with pgmq VT 30s; defaults batch 10, delay 200ms. `:221-265` applies five-real-failure retry budget, already-sent lookup and provider idempotency key. `:301-323` honors structured Retry-After (60s fallback), records cooldown and stops; 403 dead-letters/stops (`:329-337`). TTL and DLQ handling are positive controls.

No single-flight lease or VT renewal is visible. Ten slow provider requests can exceed 30s; a second consumer can reclaim before the original finishes. Already-sent lookup is not atomic with external send, so provider idempotency is essential and depends on populated stable keys/provider semantics. Cooldown is checked once at start; concurrent workers already in flight need not stop immediately. This queue does not throttle campaign Gmail/Resend paths automatically.

### MEDIUM — Group “waves” and UI defaults are not universal enforcement
`process-activity-queue/index.ts:1-24` promises five/10-minute workspace waves, but group rows are delegated without delivery in that loop (`:103-150`). Actual extension claims operate independently. Latest SQL `20261005221749…sql:127-175` clamps batch 1–5, attempts<3, ten-minute holds, blocked-group and listing-cap checks; no account/day or min-gap reservation is made. Earlier migration `20260929201343…sql:1-55` was superseded, so its absence of newer listing checks is not the final definition.

`src/lib/schedulePrefs.ts:126-147` sets smart group default 2/day and derives <=20 scheduled slots inside a window. That is client scheduling policy, not dispatch-time quota protection. `src/components/campaigns/DailyPostingLimitNotice.tsx:25-42` displays per-page/account limits, but UI text cannot establish end-to-end enforcement.

Listing cap SQL `20261005220047_0186c401-7977-4bb6-ac62-ad321f231bdb.sql:20-31` and `20261005221749…sql:115-125` concern property/lead caps, not total outgoing account posts/messages. Workspace advisory locks in group enqueue (`20261003211308_ddde1f77-b1c9-4b50-9d76-f6dfde7389ba.sql:9-10`) serialize that transaction, not all later delivery. <=100 target validation is a per-enqueue target bound, not daily sender safety.

## Cron and deployment evidence
- `autopilot-queue-drain/index.ts:1-2` says every minute; this is a comment, not installed-cron proof.
- `process-activity-queue/index.ts:13-14` says safe every 1–2 minutes; not installed schedule evidence.
- `20260512184012_email_infra.sql:295-302` describes a five-second email cron, but the inspected section is comments, not `cron.schedule` executable setup.
- `20260501011606_4e6ef18e-7d27-4941-b6bb-38783cf07b43.sql:77-83` declares reminder intent every five minutes and unschedules the named old job; intent/cleanup must not be confused with successful creation.
- `20260828135153_a2c5a915-ecd7-4341-96ba-af9b28e3ba89.sql:4-5` explicitly disables two unrelated sync/backfill jobs. Extension installation migrations establish pg_cron availability, not active workers.

Search of checked-in migrations found no executable `cron.schedule` declarations for the audited workers. Jobs may be provisioned out of band: **unknown**, not absent at runtime. Runtime audit should read job names, schedule, active flag, sanitized target function, duration/failure history and overlapping HTTP requests; never export authorization headers, vault values or raw cron command secrets.

## Recommended remediation order (no changes applied)
1. Create mandatory dispatch reservation RPC keyed by workspace + channel + actual provider connection, enforcing daily rolling/calendar budgets, per-recipient caps and next_allowed_at atomically. Route every producer through it; define timezone and which traffic classes count.
2. Replace campaign read-then-send with bounded atomic claims, leases and fencing. Carry stable provider idempotency keys; reconcile uncertain outcomes. Check all persistence errors.
3. Enforce pacing at delivery time, not only enqueue. Add sender-global concurrency and shared provider cooldown with Retry-After, bounded exponential jitter, permanent-error classification and DLQ.
4. Define separate AI-off, scheduled-campaign pause and all-outbound emergency-stop semantics. Enforce stop just before external transmission; fail closed on stop-lookup failure for proactive traffic. Remove contradictory flag precedence.
5. Add lease renewals and owner/token-conditional completion/release. Size visibility to worst-case batch latency, or claim smaller batches and renew. Make paused deferrals independent of send-attempt budgets.
6. Convert engagement pending/failed dedupe rows to recoverable leased states; only sent is final. Add retry policy, stable send key and recovery for crash/network ambiguity.
7. Add durable inbound-reply queue, atomic event claim, per-conversation serialization, debounce/coalescing and one shared outbound budget for DMs/comments. Recover abandoned sending rows.
8. Manage cron as reviewed migrations or reproducible deployment configuration; monitor lag, oldest pending, lease expiry, duplicate provider IDs, quota reservations, logical failures and kill-switch latency. Do not log message bodies, phone numbers or secrets in operational exports.

## Verification needed before any safety claim
Read-only sanitized runtime evidence: deployed migrations/functions; effective cron configuration and execution overlap; per-sender daily/rolling counters including manual/AI/engagement traffic; provider tier and permissions; external worker throttling and dedupe; populated email idempotency keys; long-running send/lease overlap; injected 429/403/network timeout/crash tests in a nonproduction environment. No runtime tests or sends were performed in this audit.
