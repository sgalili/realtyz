# Roadmap

## Rita gender, confirmed property links and transcripts November 28
- [x] Locked provider/initiation gender with male default; created separate male/female IPA dictionaries and per-call overrides, preserved Rita voice and unrelated tools, vocalized greetings and conservatively normalized Hebrew transcript labels, punctuation and Latin brand artifacts without inventing caller facts.
- [x] Confirmed send_whatsapp_links validates stored caller/workspace, rejects test calls and unsearched/nonpublic properties, uses official Meta only, and records one durable call-linked send with provider ID. Service-only receipt inbox and reconciliation handle early/replayed/out-of-order callbacks without changing existing RLS; both existing receivers deployed. No polling added; residual reconciliation waits for subsequent callbacks or sender completion during quiet periods.
- [x] 68 focused tests passed, including mocked accepted-send and no-resend checks; actual local secure search/initiation/link endpoints returned expected 200/400/401 results, female dictionary selected correctly, and signed deployed official callback returned 200 and persisted. Temporary verification contexts/receipts removed; real public property page rendered at 411x801 without browser errors. Live ElevenLabs prompt, dictionaries, voice and both tools read back successfully. No audio pronunciation or real phone call verified.
- [x] Publishing requested for toraff.co.il after the user explicitly chose publication despite 39 unresolved critical findings; deployment completion is not yet confirmed. Fresh quick scan has no actionable findings; completed deep scan reports 39 critical and 50 warning findings, not fixed by this voice-focused request.
- [ ] Send the approved single WhatsApp verification to the same saved test number, identified uniquely from five requester-owned test calls: blocked by closed 24-hour WhatsApp window and Meta review of submitted rita_property_links_v1 (PENDING). Runtime checks approval live and enables the template after approval; a real incoming WhatsApp message can open the service window sooner. No real message sent.

## Realtime publication reduction November 28
- [x] Removed only campaign_activity_queue, fb_cloud_sessions, fb_user_groups and platform_branding from supabase_realtime; all tables, rows, RLS and application code remain intact.
- [x] Verified campaign_logs, engagement_events, property_tours and rotating_messages remain the only publication members; all four signed-in subscriptions reached SUBSCRIBED and cleaned up without page errors or test writes.
- [x] Fresh scan completed, change committed as 997f45d16 and publishing requested for toraff.co.il. Deployment completion was not confirmed; the publish gate reported 23 pre-existing unresolved critical deep-scan findings, left unchanged under the explicit security-scope rule.

## Rita summaries on existing cards November 28
- [x] Service-only sync_rita_post_call transaction locks stored conversation/contact identity, matches workspace-scoped lead_id then normalized phone, updates profile hats without buyer leads, and writes one call/timeline item. Existing RLS unchanged; unknown callers without a verified workspace remain unassigned.
- [x] Shared compact Hebrew summary/insights block, latest-call badges and click-only RLS transcripts on Leads, Deal Room, authorized profile/admin user cards and waiting-broker cards. Provider configuration supports factual 2–3 bullets and next step; no live provider settings changed.
- [x] One private data-free account notification refreshes scoped cards with no new polling. Thirty-six focused tests passed; real signed concurrent webhook returned 200 three times with two duplicates and one call/message, invalid signature returned 401. Signed-in Leads, Deal Room and user profile verified, mobile 411px checked, and open card updated in 2.29 seconds without reload. Verification data removed and original lead restored; no new leads or calls placed.
- [ ] Publish this request's handler/UI changes to toraff.co.il, then verify the updated production webhook; awaiting the user's publishing choice. Database functions are applied; production still runs the previous handler until publication.

## ElevenLabs-only role-aware calls November 28
- [x] Removed Vapi UI, source functions/status route and fallback routing; Homely's unrelated webtivapi URLs are untouched. Deployed retirement waits for replacement verification below.
- [x] Server-owned hats across shared public property callback, both campaign dispatch paths, AI dialer, retry, broker-assistant/test buttons, invitation first-login and inbound calls. Scalar provider context preserves structured property facts; only property_lead post-calls create/update buyer leads.
- [x] Service-only arm/claim/cancel RPCs use the existing minute dispatcher, preserving consent, OTP phones, bounded waiting, cancellation and no automatic replay. No historical provider calls restarted.
- Scheduling uses the existing one-minute dispatcher, not the initially proposed temporary checks: the 60-second minimum wait can be followed by up to one minute of tick latency, with late calls blocked after the bounded window.
- [x] Synced the live agent's hats, context and duration override through ElevenLabs API; saved voice/greeting and all three production URLs verified. Production context requests for all four hats, general inbound, property search, signed post-call and no-op invitation dispatch returned 200; invalid key returned 401. Twilio line remains assigned to ElevenLabs.
- [x] Published the replacement and verified the new production handlers before attempting Vapi retirement. Updated public-lead-gate, retry-ai-call and scheduled-post-dispatcher were deployed.
- [ ] Retire deployed vapi-outbound-call, vapi-tool-handler, vapi-call-webhook and vapi-verify-credentials, then remove the saved Vapi credential row: deletion tool refused because publication has not registered the latest commit and explicitly requires a later turn. Old endpoints/credentials remain as rollback coverage; new app triggers never route to them. Provider's old-call audit returned 403, so outstanding external Vapi calls could not be verified.
- [x] Fifty focused tests passed across the full run and final deadline test, including isolated database consent/claim/cancel/expiry/permission tests and signed post-call role fences. Real authorized mobile/desktop connection checks and cancelled test confirmations passed without browser errors or calls; build OK. Temporary local/production verification contexts were removed; no invitations queued or real calls placed. Prerecorded IVR remains its existing ElevenLabs TTS/Twilio lane, not a conversational agent call.

## Rita live production routing November 28
- [x] Updated the live ElevenLabs inbound-context URL to toraff.co.il; verified property search and post-call already use production. Preserved active voice, language, greeting, tools and qualification settings, adding only the missing lead_name prompt context.
- [x] Authenticated production inbound and existing outbound-context requests returned 200; invalid x-rita-key returned 401. Required dynamic variables and +97233826735 assignment verified; temporary contexts removed. No real calls placed.
- [x] Fresh pre-publication scan had no actionable findings; fifteen focused tests passed and build OK. Publishing requested for toraff.co.il; deployment completion and actual phone calls remain unverified. Publish gate noted some scans stale for the documentation commit, so a fresh/deeper check is recommended before broad sharing.

## Rita preview origin synchronization November 28
- [x] Accept HTTPS preview subdomains on lovable.app and lovableproject.com alongside toraff.co.il without allowing lookalike domains, credentials, paths or insecure URLs.
- [x] Twenty-three focused tests and typecheck passed; a fresh security scan found no unresolved critical findings. No live provider sync was triggered during verification.
- [x] Published the requested change; the production property-search callback returned 200 with five public matches after deployment. No live provider sync or phone call was triggered.

## Rita end-to-end phone integration November 28
- [x] Required full name in the shared property callback form and server gate; existing lead qualification, consent and charging rules retained.
- [x] Server-resolved broker, office, lead and property context for property callbacks, campaigns, lead picker, AI dialer, retries, inbound calls and the explicit confirmed test-call action. Legacy scheduled broker-onboarding Vapi flow retained for compatibility.
- [x] Signed Rita property search with broker-first and public-safe cross-broker fallback; no private contacts, drafts or rewards returned.
- [x] HMAC-verified post-call sync with transcripts, qualification, matched properties and idempotent CRM/call/message updates. Real local route test passed twice with one row each and complete test cleanup.
- [x] Connected confirmed Twilio number +97233826735 and configured ElevenLabs tools, dynamic variables, initiation and post-call webhooks; no real call placed. Production publishing requested.
- [x] Twenty-five focused tests passed, typecheck/build clean, mobile voice settings and guest callback form verified.
- [x] Production callback reachability confirmed after deployment with a signed property-search request returning 200 and five public matches.

## Voice agent settings November 28
- [x] Account-owned authenticated settings save with readback, controlled drafts, bounded requests/finally and safe retry; no RLS or workspace ownership changes.
- [x] Verified live ElevenLabs access and created/synchronized the requester's account agent; language/voice/greeting read back from provider after reload. Phone binding is explicit/confirmed and rejects another agent's number; availability remains a preference, not ring-first routing. Legacy Vapi and ElevenLabs endpoints retained.
- [x] Real greeting save/reload and original greeting restoration verified; existing Sarah voice retained. Eight focused tests passed, mobile/desktop panel checked with no page errors.
- [x] Twilio voice number +97233826735 is connected and already assigned to the requester's ElevenLabs agent; live inbound routing exists. Post-call webhook secret and end-to-end CRM synchronization remain open in the Rita integration task above.

## Visitor content audit November 24
- [x] Added broker-only About slides and shared FAQ page/dialog data; clarified broker pricing/terms/privacy and contact copy, hid guest public-publisher CTA, normalized guest signup intent. Broker /pricing now opens public credit information; marketplace wallet redirect, copy and actions retained. Visitor leaf metadata updated; root-only placeholder social images removed.
- [x] Rita greeting/public broker context aligned with direct office leads, no per-lead charge, approved campaigns, draft imports and read-only demo; separate mode transcript/live tokens retain marketplace history without crossing contexts. Deployed existing visitor-rita; no private data/tools/permissions added.
- [x] 67 app tests and 5 Rita boundary tests passed; build OK. All guest destinations checked at 411x801, both content modes verified at 1280x1800 with intercepted public settings only, marketplace transcript preserved/excluded correctly, actual broker demo/pricing navigation and accessibility verified. Real anonymous Rita replied with broker-only tools and no per-lead fee; no runtime errors. Contact delivery not exercised, no global settings or existing records changed; frontend requires publishing.

## Scanner read-only health November 24
- [x] Read-only queues/events/deployed reservation confirm 176 ready, 1 awaiting reply until 07:53 UTC, 3 saved, 5 manual; 6/20 attempts, fresh worker, zero send errors and no expired active leases. Historical lookup failures: 51 cancelled, 3 stale-worker, 224 not_found. No mutations or scanner control actions.
- [x] Existing panel/row dialog now distinguish quota, serial reply wait, pacing, disconnect, stale worker, refresh failures and persisted failure reasons. Scanner status reads the serial blocker globally as well as per-row; no queue/pacing/write logic changed. Deployed existing scanner handler.
- [x] 32 focused tests passed; signed-in requester panel verified real 6/20, 8/185 and explicit reply-wait reason with no runtime errors; build OK. Row dialog not exercised in this view because no lookup controls were rendered. Reply-correlation and long source lease limits reported from code/data, not changed. Frontend requires publishing.

## Vibrant broker visitor experience November 24
- [x] Refresh inline guest welcome with existing Rita artwork, colored benefit bands and reduced-motion-aware icons/logo strip.
- [x] Restore VisitorMenu/VisitorRitaChat in broker-only app header; remove guest standalone sign-in icon, preserve marketplace/signed-in headers. Existing public chat uses a validated broker presentation, no private context/tools; deployed visitor-rita.
- [x] Refine OTP presentation and immediate demo fallback without changing authentication. 24 focused app tests and 5 public-chat boundary tests passed. Mobile/desktop menu, full chat, auth/demo navigation and rejected OTP fallback checked; live Rita replied with broker-only guidance. Reduced motion disabled animations and full-marketplace kept its original root. No real OTP sent or account data changed. Frontend requires publishing.

## Import and registry refinement November 24
- [x] Icon-only repeat beside pause/discovery uses the same set_import_repeat RPC; old labeled row removed. Imported summaries default collapsed; secondary tabs gray and dashboard badge removed.
- [x] Railway worker drains each saved broker's inventory before further discovery, including recovered backlogs, retaining active cursors. Fallback discovery upgrades no longer reset entities; short pace sleeps avoid an extra step. Scanner source work skips idle delay, ticks before slow reads and retains serial/quota/jitter/reply/error safeguards.
- [x] Durable exact broker/license no-match via protected broker_registry_no_matches and fenced service-only RPC; gray state read back by admin list, no-match batch inserts excluded. Temporary failures stay red/retryable. User confirmed manual gender only; no saved genders changed.
- [x] 55 focused app tests, 17 worker tests (including two-broker property-before-next flow), and 5 scanner tests passed; preview builds OK. Signed-in 411x801/1280x1800 checks show 285 real broker/import rows, gray secondary tabs, compact controls and expandable summary; dashboard corner badge absent. No registry checks/imports/messages launched; active job continued from 1 to 9 drafts without reset. Four existing Cloud functions deployed and schema applied; no-match writes validated by tests, not a live verification.
- [ ] Deploy updated worker and worker-whatsapp services on Railway: external deployment unavailable here. Existing active job and saved inventory were not reset; full live pacing after deployment remains unverified.

## Broker guest home and OTP entry November 24
- [x] Brokers-only guest root now mounts BrokerGuestHome in AppLayout with concise benefits and signup/login/demo actions; old Landing and full-marketplace board retained. Guest home scroll ends above the legal footer; page headings opt out of hero hiding.
- [x] Guest sidebar has home/signup/login/direct broker demo/FAQ/accessibility, without professional or marketplace entries. Auth defaults to OTP login in broker mode, preserves explicit signup/login via URL and existing invitation binding, uses clean wordmark and offers immediate or failed-OTP read-only demo. Server verification unchanged; guest private prefetch prevented.
- [x] 29 focused entry/OTP/demo/metadata tests passed. Fresh signed-out 411x801 and 1280x1800 browser flows verified home/menu/login/signup/demo properties, no horizontal overflow or runtime errors. Real OTP not sent; rejected OTP tested with mocked service, no session created. Footer boundary verified at 751px in 801px viewport.

## Rita brain and voice connection November 24
- [x] Reused canonical masterAgentPrompt Rita identity/persona/format/brevity text via a pure rendering module; legacy auth resolver and prompt exports retain their API. Existing IVR Rita/Zina voice and v3 settings reused; ElevenLabs connector verified linked, Vapi settings fallback retained.
- [x] Both stages read bounded global_ai_documents plus exact broker-local draft facts, first name and saved gender. No active-workspace lookup, private broker KB or sender persona. Stage 2 first generates a short script through streaming Responses and then narrates it with ElevenLabs; Stage 3 injects the same identity/global brain/facts with the short no-tools demo instructions.
- [x] Consent, original 60-second deadline and cancellation remain unchanged. 29 focused tests plus isolated PostgreSQL tests passed; sample-only real AI script succeeded with name, feminine language, property and official support. TTS and Vapi payloads verified with mocks only; no voice, send or call performed.
- [x] Connected files/parameters and manual provider setup reported in Hebrew. No new database changes, secrets, public route or outgoing messages created.
- [ ] Live ElevenLabs narration and Vapi/Twilio call/cancel remain unverified without an approved recipient test; Vapi dashboard must have the Twilio number and ElevenLabs provider credential with Rita voice access. Publish required for the new TanStack script/call helpers; Meta template/service-window setup from the prior task remains outstanding.

## Broker opt-in outreach and first-login demo call November 24
- [x] Inspect existing invitations, consumed-OTP helpers, first-entry RPC, signed Meta/Resend receivers and Vapi/Twilio paths. ElevenLabs is connected; Vapi/Twilio configurations exist but their live capability is unverified.
- [x] Add separately enrolled property-aware outreach through the existing template-approval and email-consent paths. Exact sender/reply checks and transactional positive/opt-out state feed Rita's existing voice via ElevenLabs v3; WhatsApp replies receive official audio, email replies receive the voice attachment by email. Legacy invitation bodies stay unchanged.
- [x] Record actual consumed OTP and its verified phone separately; authenticated first-entry activation creates one in-app alert per Super Admin plus a separately logged official WhatsApp send attempt. A 60-second deadline, separate explicit call consent, provider cancellation acknowledgement and private account panel guard human takeover. User confirmed explicit call consent in this turn.
- [x] Vapi's documented schedulePlan owns the accepted delayed call outside the browser; server verifies a Twilio phone-number provider, submits a tool-free maximum-90-second Rita demo, logs ID/outcomes and reads webhook status back from Vapi. Unknown submission outcomes are not retried. No permanent polling job added.
- [x] 24 focused policy/provider/OTP/invitation/UI tests and isolated PostgreSQL consent/deadline/notification/reply/opt-out/auth tests passed. Signed-in 411x801 and desktop panel loaded real profile state with sends disabled by default, no overflow or runtime errors. No journey enabled, real OTP sent, voice generated, message sent or phone call initiated.
- [ ] New TanStack callbacks require app publishing before the existing signed receivers can reach them. Vapi/Twilio live provider and scheduled-call cancellation/readback remain unverified without an explicitly approved real test recipient.
- [ ] Property-outreach Meta template and out-of-window Super Admin login-alert template require approval; do not promise WhatsApp delivery outside the 24-hour service window. In-app alerts persist even if WhatsApp is refused.
- [ ] Recovery before Vapi accepts a schedule is bounded to an authenticated retry within the original deadline, not a durable autonomous worker. Failed webhook handoffs and ambiguous voice sends are logged for review; quiet-period autonomous recovery is not implemented and must not be described as complete.

## Import recurrence and Bright Data balance November 24
- [x] Persist repeat independently of active checkpoints; chain clean discovery batches with exact configuration/remaining directory entities. OFF follows the active successor; pasted finite lists have no automatic next set. Failed batches never repeat, and developer working-project state never carries into the next batch.
- [x] Remove the hidden ten-property parser cap for explicit maxima up to 50; derive source page counts when totalPages is absent, using the existing multi-page worker handoff. Label limits as ceilings and show actual workspace/source-matched saved property counts, bounded in the expanded view.
- [x] Explicit Bright Data balance evidence triggers a service-only six-hour per-Super-Admin claim, persisted notification/send outcome and existing force-official WhatsApp sender; rate limits/generic suspension do not trigger balance alerts. Two existing Cloud entrypoints deployed.
- [x] Isolated PostgreSQL tests cover active progress, leases, successor config/frontier, developer work exclusion, OFF, failures, role denial, saved counts and alert dedup. 31 focused UI/parser/alert tests and worker-only runtime tests passed. Signed-in mobile/desktop verified toggle readback through intercepted requests only, real ceiling/counts and no runtime errors. Existing active job remained running with repeat OFF; no paid scan or WhatsApp sent.
- [ ] Updated standalone Railway import bundle needs deployment by its owner; no Railway deployment access exists here.
- [ ] Real WhatsApp alert delivery is unverified: no matching approved balance-alert template exists, so outside an active Meta service window the current official free-text send may be refused. An approved template is required for guaranteed out-of-window alerts; failures remain recorded rather than marked delivered.

## Scanner persistent runs and toolbar November 24
- [x] Read scanner card, both browser loops, registry lookup/save/identity checks, both worker lanes and persisted pending/history/job states. Registry and bulk enqueue previously depended on the browser; actual queued discovery/scanner work already uses independent workers.
- [x] New confirmed discovery selections persist all eligible targets atomically; registry snapshots the authorized full red waiting list into serial leased batches/items. Shared transactional identity save rejects stale/borrowed licenses and post-cancel writes. Event wakes plus active-only minute recovery unschedule on completion/cancel. New batches link both discovery stages and recover paused/missed continuation using the existing scanner tick, without launching historical jobs or changing limits.
- [x] Expanded panel shows end-to-end completion, compact persisted registry total and formatted line number; all three toolbar actions require start/stop confirmation, including settings saves that pause the line. Added live active/saved/remaining sort (stable inside groups) and opposite green spinner/timer. Original newest order is restored by toggling sorting off.
- [x] 80 app/SQL/runtime tests and 14 Node tests passed; build OK and four Cloud functions deployed. Requester's actual desktop and 411x801 mobile views verified: counters 2/185, registry 0/0, formatted line, confirmations cancelled without mutations, 237 rows ordered in groups 183/2/52, green opposite spinner and no runtime errors. Isolated PostgreSQL tests exercised 25 real test targets, logout continuity, cancellation fences, identity save, both-stage progress and unchanged 3/15 quota. No live bulk check/scan/send/pause/cancel initiated; actual complete provider send/reply and a real Cloud outage were not induced. New runs remain dependent on the existing independent worker being available; previous Railway code redeployment blocker remains below. Frontend live changes require publishing.

## WhatsApp connection-resilience flow sweep November 24
- [x] Read pending/import/send-history parents, scanner panel, contact/timer/editor/bulk controls, registry batch and linked official invitation UI; both Node lanes, discovery service, scanner tick/preflight/send, webhook/replay, continuation and live service-only claim/recovery/heartbeat/finish/reservation/reply/error/promotion/eligibility/cancel definitions. Database atomic fences/settled-row guards remain unchanged; claims/sends/uncertain commits are not replayed.
- [x] Fixed parent queries unmounting cached rows and backend partial failed reads being returned as empty/partial history/identity success. Extended clean read retries to parent lists and invitation eligibility; preserved explicit accepted-send warnings, sanitized remaining presentation-only error paths and caught optional avatar-refresh rejection. No stored sent content/settled records, permissions, configured quota/pacing or demo data changed.
- [x] Preserved transient causes in scanner DB wrappers, prevented infrastructure failures from automatically pausing a healthy line, added bounded read-only Green preflight retries and idempotent event/continuation retries. Deferred individual failed replay events to the existing tick. Webhook state checks now fail retryably rather than treating an unavailable timestamp as a new disconnect. Actual disconnect/auth/send circuit handling and no-resend/manual-review policy remain intact.
- [x] 74 focused app/runtime tests plus 14 Node worker tests passed; build OK. Four affected Cloud functions deployed. Requester's signed-in account verified; actual waiting UI retained all 219 cached rows, responsive timer/manual dialog and 3/15 through injected worker/scanner/parent-list failures and successful readback, with no raw socket text or runtime errors. No discovery/send/control operation initiated; a real backend outage or new real provider send/reply was not induced.
- [ ] Deploy the changed worker-whatsapp scanner lane to Railway: source-result response loss no longer gets misreported as source failure; Node tests pass, but Railway deployment access is unavailable here. Cloud changes are deployed; frontend live-domain changes require publishing.

## Broker recovery connection resilience November 24
- [x] Traced the sole RPC caller in broker-whatsapp-worker before user operations/worker claim; returned/thrown recovery errors escaped into raw UI messages and stopped row tracking. Read the live service-only recovery definition: settled rows are not replayed, lease recovery remains protected. Live scanner was enabled/unpaused with a current worker check-in and 3 reservations against a 15/day cap; no matching reset found in sampled current logs.
- [x] Added three total recovery attempts with 250/750ms backoff for transient failures only; exhausted/other recovery errors are logged and deferred without blocking the real operation. Shared frontend requests sanitize transport/provider errors and retry only status/batch/eligibility reads, never replaying mutations. Cached card/quota/row state, editor drafts and polling survive failed refreshes; only actual action/terminal-job failures raise Hebrew messages.
- [x] 34 focused tests and build passed; deployed broker-whatsapp-worker. Signed-in requester account verified in the account menu; real admin import UI/row dialog and 3/15 counter verified through injected failed status requests and successful readback, with no raw socket text/runtime errors or discovery/send/control actions initiated. Backend reset resilience was tested with thrown/returned faults, not by disrupting the live database; frontend live-domain changes still need publishing.

## Mode-aware presentation November 24
- [x] Centralized reversible broker/marketplace title, description and default sharing copy; Helmet owns route head/canonicals and restores defaults after property-page exit. Profile sharing, header tagline and subscribed loader tagline follow the public-safe platform setting. Original marketplace strings/assets remain intact. Static index fallback now describes the default broker platform.
- [x] Eight focused tests and current build passed. Browser verified actual public broker settings, local cache marketplace/broker round trip without global setting writes, mobile broker demo header and exact-route canonical (including basename), unavailable property route, and no duplicate head tags/runtime errors. No messages, publication or backend changes performed.
- [ ] Automatic mode-aware previews for non-JavaScript social crawlers require approved server rendering/template migration; current static HTML uses broker fallback, while browser metadata and explicit shared text switch dynamically. User informed; static changes reach live URLs only after publishing.

## Broker demo and bulk registry recheck November 24
- [x] Inspected shared App/demo/transport and the red waiting predicate, existing registry action and its server authorization/identity checks.
- [x] Demo reads only public platform settings before isolation, defaults broker-only entry to Properties, uses a broker-only workspace/sidebar and shared pages, gates all marketplace routes before mounting and shows explicit read-only denials. Sample signatures, tours, notes and wallet support exploration; full-marketplace personas remain available.
- [x] Added a third shield icon on the scanner toolbar. A fresh complete waiting list drives serial existing registry checks for red non-developers, independent of search. Exact saved response updates its row; missing licenses/failures are counted; scoped cancellation and one final refresh prevent stale updates and repeated full-list pressure.
- [x] 58 focused tests passed and build OK. Mobile broker sidebar navigation, tasks tabs, signatures approval denial, campaigns, marketplace redirects and desktop cockpit/external-window blocking verified; only public platform-settings requests escaped demo isolation. Authorized bulk UI checked with intercepted fixture records: 2 red targets became green, existing green untouched. No real bulk registry checks, messages or settings changes initiated; live registry lookup/provider outcomes were not exercised in this request.

## Discovery and invitation flow sweep November 24
- [x] Read row/editor/bulk/timers, user-table/create-user invitations, email/official templates, Auth/publisher/upgrade OTP, public and legacy demo paths, scanner Worker/webhook and live claim/reserve/promote/finish/reply/cancel/follow-up functions. Campaign and import timers already use timestamps; follow-ups only queue and never send automatically.
- [x] Added explicit contact clear/readback; fresh-code retry after expired/consumed OTP or failed session continuation; publisher propagates final sign-in failure; all broker invitation entry points use the personal-link choice; legacy email renderer aligned. Public demo rejects sample writes without changing sample data. Server now continues single/bulk no-match discovery on the same authorized source independently of mounted cards, respecting pause/contacts/dedup. Settled history, roles, quotas and settings unchanged.
- [x] 77 focused tests passed; authorized mobile status/manual controls and guest refusal/retry/public sample inventory verified. Changed Cloud handlers deployed, build OK. No real message, import, contact edit or queue jump triggered; successful real OTP delivery/session and a new real background continuation remain unverified without a consenting recipient/approved scan. New WhatsApp default still requires Meta approval.

## Live discovery and invitation flow November 24
- [x] Timestamp-anchored 1000ms countdown, active spinner, clickable status/manual editor and audited Super Admin queue promotion; serial reply deadline included in ETA, no quota/pacing bypass.
- [x] Equal 8px gaps verified above/between tabs; first broker invitation copy and personal links updated. Previous sent templates/history preserved; new default WhatsApp text requires Meta approval.
- [x] OTP failure offers retry/public sample-only demo; imported broker OTP binds uniquely saved WhatsApp server-side without changing login phones. 58 focused tests passed, authorized mobile/desktop status/editor checked, guest refusal/demo verified with zero remote demo requests. No messages, imports, real contact edits or queue promotion triggered. Successful real OTP delivery/session remains unverified without a consenting recipient.

## Import controls cleanup November 24
- [x] Compact WhatsApp settings, prevent repeat row discovery, confirm selected bulk targets with server eligibility and existing batch cancellation.
- [x] Import-tab controls, counts, newest-first waiting list, hero search and import actions; last completed run read separately from the five recent jobs.
- [x] 31 focused tests and signed-in 411px/1280px checks passed; selection, cancellation and search verified without starting imports or messages. Both changed Cloud handlers deployed.

## Dedicated Green API discovery request November 22
- [x] Inspect live broker_whatsapp_jobs/contacts/batches/shared-number schema and claim/finish/recovery functions, discovery Worker/Cloud handler, Green webhook/helpers and broker-card/invitation mapping. Existing discovery is HTML-only; outreach is disabled and the Green webhook drops messages. No sends or live data changes.
- [x] Implemented isolated scanner tables/RPCs (0273), broker-whatsapp-scanner and authenticated webhook, Worker lane and Super Admin panel/card control. 15/day, 45–180s jitter, 09–18 Israel hours, single outstanding inquiry, no resend of unknown outcomes, pause on disconnect/3 errors. Tests passed; unauthenticated calls return 401. No messages sent.
- [ ] Scanner credentials saved; set the scanner instance webhook URL/token in Green API, deploy the Worker lane to Railway, then run Test connection and Resume. Not done: no Green API/Railway access here.
- [ ] Verify live Yad2 reply attribution (now name + single-outstanding correlation) and broker card readback after ▶ during 09:00–18:00. Blocked on the line being resumed in the send window. User's real reply sample parses to the seller link (regression added). The sample contains no ad URL; saving needs the reply to quote the sent message ID, otherwise it goes to manual review. Raw webhook quotation/message correlation and an explicitly approved controlled live test remain unavailable; never infer broker identity from a shared chat's latest pending job.

## WhatsApp reset and broker rows November 22
- [x] Removed five Yad2-discovered contacts carrying the same shared number and reset five completed discovery statuses; Cloud readback confirms zero discovered contacts and zero active jobs. Login phones, inventory and manual contacts remain untouched; no scan restarted.
- [x] BrokerContactQueueCard puts trash at the contact-row edge, removes the broker bottom summary entirely, and displays license once next to the full name regardless of gender; the saved city sits between license and office with its logo. Developer summaries remain unchanged.
- [x] brokerWhatsApp rejects the observed shared Yad2 action; broker-whatsapp-worker deployed, 31 tests passed and build OK. Authenticated 411px/1280px screenshots of a real city-bearing broker verify order, cleared WhatsApp, trash placement and no overflow/runtime errors. No paid source reads or messages.

## Stop bulk WhatsApp tracing November 22
- [x] Stopped the requesting Super Admin's 50 active discovery jobs and fenced their leases; a fresh Cloud read confirms zero pending/running/retry jobs. Completed contacts and import queues were not changed.
- [x] Added account-owned broker_whatsapp_batches and protected start/status/cancel actions. The bulk button stays clickable throughout enqueue/source processing, restores running state on return, and cancels only its exact batch; locked insert guards reject late enqueue and cancelled leases reject late results.
- [x] Deployed Cloud action and migrations; authenticated running-button click/cancel/readback passed using a queue-free operation (no broker tracing restarted). Database tests verify real-job cancellation, late-result/enqueue refusal, idempotence and preservation of contacts/completed jobs/imports. UI test verifies stop during an in-flight page request.

## WhatsApp whole-flow check November 22
- [x] Read single/bulk discovery, both editors, queue mapping/card, official invitation UI/backend/target helper, worker/transport and all effective claim/heartbeat/recovery/finish functions. Portal/health WhatsApp fields are independent and do not consume discovered broker contacts; no unrelated settings or sent history changed.
- [x] Preserve shared contact cache on both enqueue paths and update it immediately after manual save even if refetch fails. Production extraction now checks the saved source token and exact primary sticky-contact section; hidden/unrelated actions are excluded. Future finish locks/readbacks the actual stored number and terminalizes conflicts without overwriting it or falsely completing.
- [x] 54 focused tests plus isolated database lease, concurrency and cancellation checks passed. Strict extraction still finds one valid mobile in the previously fetched real HTML, and authenticated UI retains the saved WhatsApp after stop with zero runtime errors. No messages sent, login changes or repeated paid source checks. Official Meta approval/delivery and all external worker deployment settings remain unverified.
- [ ] Deploy the updated worker-whatsapp serialized-payload guard to Railway; deployment access is unavailable. Cloud extraction/save/cancellation are deployed and do not need that worker update; the new local oversized-payload handling is code/unit-tested only.

## WhatsApp extraction and broker card November 22
- [x] One real Bright Data read returned 200 with an explicit WhatsApp anchor in the primary agency contact section under a sticky aside; the old parser removed that entire aside. Retain only this observed primary contact section, continue rejecting unrelated/hidden/ambiguous contacts, and log extraction counts/reasons without phone values. Existing contact-to-queue mapping was correct.
- [x] Status now returns the broker/workspace-matched persisted WhatsApp contact, so the slot refreshes even after unmounted completion; manual saves invalidate this read too. Email icon moved after its text, broker trash moved to the drafts row at the far edge, and number text increased 14/16px to 16/18px without changing developer layout.
- [x] Deployed broker-whatsapp-worker; 35 tests passed. Authenticated real discovery completed on attempt 1, saved a normalized source/owner-matched WhatsApp contact and displayed it in the card. Mobile/desktop screenshots confirmed icon/trash placement, 16/18px number sizes, no overflow or runtime errors. No messages sent, login number changed, bulk scan started or Railway service changed. No-match/ambiguity remains explicit rather than inventing numbers.

## Broker discovery trigger and registry identity November 22
- [x] Repair idempotent discovery enqueue and restore pending spinner from Cloud; real shared-secret claims/results returned 200. The three previous jobs had no worker/attempts; temporary authorized worker processed them without messaging.
- [x] Align registry shields at 16px without compact wrapper, use green verified/pale-gray failed states, and accept saved imported license for official names on unverified accounts while protecting locked identities and other-account ownership.
- [x] 35 focused tests and signed-in mobile click/enqueue/repeat/readback passed; real registry 404 clears after five seconds. Real source reads saved not_found, and the clicked discovery button returned to enabled. No contact number invented or messages sent.
- [ ] Deploy the separate Railway WhatsApp service for continuous consumption; deployment access is unavailable here. Temporary execution verified the code/auth, not permanent Railway availability.

## Import secondary tab band November 22
- [x] Raise the pending-invitation secondary tab row by 8px, from 20px to 12px top spacing.
- [x] Pin the secondary row directly below the existing primary sticky band with an opaque background and verify signed-in mobile scrolling.

## Broker discovery and registry controls November 22
- [x] Replace WhatsApp discovery dialog with immediate enqueue and in-button activity through pending/running/retry; terminal states restore the control. Actual authorized enqueue returned pending with no dialog.
- [x] Move registry verification to the unverified shield and approved labels in Profile/admin user editing, with a persistent pale-gray failure state and independent five-second error clearing; existing server authorization/identity checks remain unchanged.
- [x] Verify scope guards, duplicate-click prevention, timed error clearing and authenticated mobile presentation: 38 focused tests and build passed; real license mismatch stayed protected, error expired and gray icon remained. Discovery completion with a real number is unverified while its job is pending (existing Railway WhatsApp setup task).

## Automatic import failure continuation November 22
- [x] Replace item-error job stops with three URL-local attempts, persisted failed-source records and automatic cursor advance across broker/developer/draft paths.
- [x] Recover error-paused and lease-stalled jobs automatically while respecting explicit user pauses and fatal authorization/provider failures; deployed 0266/0267 and reactivated the exact failed live job without changing its 39 saved drafts.
- [x] Update progress presentation, rebuild the standalone worker and verify retry/skip/recovery: 41 focused tests and isolated database checks passed; authenticated mobile readback shows running state and the failed source consumed. Live worker heartbeat resumed and drafts increased from 39 to 42 after exact-source recovery.
- [ ] Deploy the updated standalone Railway import worker bundle; deployment access is unavailable here. The existing live worker is running and saving again through Cloud compatibility recovery; its new bundle deployment is not verified.

## Active import count rings November 22
- [x] Match the count ring to the exact broker/developer currently importing inventory, not inherited history status.
- [x] Share progress polling and transfer the ring between items while preserving saved counts; no Worker or schema changes.
- [x] Test broker/developer transitions and stopped jobs; verify one real broker ring around its saved count in signed-in mobile UI. Live next-item handoff was not observed during the current provider wait.

## Import navigation and visitor loading November 22
- [x] Keep red import errors inside expanded status details only; actual expanded/collapsed card verified.
- [x] Restore import tabs and UI state immediately on client-side return without a splash; real Super Admin section return measured about 280ms with no document reload and preserved developer tab/expansion.
- [x] Disable loading splashes for guests so welcome slides remain visible; all three slides verified on mobile/desktop with delayed network, 33 focused tests passed.

## Broker WhatsApp worker November 22
- [x] Add an independent, fenced discovery queue that stores source-backed WhatsApp contacts without replacing login phones.
- [x] Add Super Admin broker-card discovery/contact controls; user chose discovery only, with manual official Meta invitations and no private-device chat.
- [x] Test queue isolation, phone normalization, retries and card behavior; 27 focused tests plus isolated database tests passed, real signed-in mobile status dialog verified, Cloud queue contains one pending discovery-only job.
- [ ] Deploy `/worker-whatsapp` to a separate Railway service and verify live Yad2 discovery; blocked on Railway service setup and copying the saved shared secret plus Bright Data configuration. No automated messages are supported.

## Properties bulk action toolbar November 21
- [x] Move selected-property bulk actions to a dedicated row below the multi-select controls.
- [x] Use a borderless Globe publish action and keep the photo-rotation spinner active until every selected update settles.

## External import worker November 21
- [x] Make worker standalone with four paced source channels, durable retries and incremental private saves; 15 Node tests, developer save and isolated queue tests passed; protected Cloud endpoint deployed and lease refusal verified.
- [x] Prepare a runnable Railway TORAFF worker folder and document exact environment variables.
- [x] Queue Super Admin broker/developer requests without browser scan loops.
- [x] Add protected external-worker claiming/progress and disable legacy dispatch for external jobs.
- [x] Verify polling, authorization and persisted progress with browser, unit and scratch database tests.
- [ ] Connect and verify the external worker deployment (awaiting Railway/Render deployment access and environment variables; same-process integration additionally needs the existing TORAFF entrypoint; no paid live import run).

## Developer and broker card refinements November 20
- [x] Swap the developer hero back and add buttons into their requested positions.
- [x] Remove per-account photo reordering, swap delete/invitation actions and use a trash icon.
- [x] Swap the project count and multi-select toggle, and add photo reordering for selected items.
- [x] Match project apartment details to the homepage presentation, with Hebrew fields and no Yad2/raw identifiers.

## Import hero action and office logos November 20
- [x] Remove the import body title and move its new-import action to the far-left Super Admin hero controls.
- [x] Keep available broker office logos immediately before office names in queue and send-history cards.

## Import workspace tabs November 20
- [x] Keep a collapsed import status above three sticky campaign/chat-style tabs: pending invitations, import history and send history.
- [x] Show only the selected tab's content, preserve view restoration and verify mobile scrolling and transitions.

## Multi-select visibility November 20
- [x] Show project and apartment selection marks only while general multi-select mode is active, and clear bulk actions on cancellation.

## Developer projects and import adjustments November 20
- [x] Show actual developer logos in fixed square frames everywhere developer identity cards appear.
- [x] Move Our Projects back navigation into the blue hero and rebalance count, multi-select and commission controls.
- [x] Scope the page's Yad2 import to the current developer and skip existing projects/apartments.
- [x] Collapse Super Admin import status panels by default and verify mobile/desktop behavior.

## Scoped image rotation November 20
- [x] Restrict first-two-image rotation controls and execution to authenticated Super Admins, excluding demo accounts.
- [x] Add scoped broker/developer record actions covering only their listings, projects and apartments, with confirmation and counts.
- [x] Add single-listing/project-apartment actions, focused permission and rotation tests, and browser verification.

## Invitation history and developer property cards November 20
- [x] Hide unsent 48-hour follow-ups and thread only actually sent follow-ups into the original invitation card.
- [x] Restore the Super Admin section, history tab and open send card from session state.
- [x] Match developer project apartments to home list/grid presentation and include developer details in expansion.
- [x] Add permission-aware three-dot actions to closed and expanded property cards, including full Super Admin editing.

## Final broker import updates November 20
- [x] Automatically resume broker imports after an adapted 429 delay, including background wake-up.
- [x] Remove original Yad2 source links from Super Admin import history.

## Super Admin demo role switcher November 18
- [x] Added a dedicated Super Admin section "תצוגות דמו" with a role switcher: quick-select dropdown plus six role cards that enter the matching public demo immediately, and a new-tab link on the canonical domain.
- [x] 12 focused tests, TypeScript and signed-in browser checks passed: dropdown jumped to /demo/developer and a card button to /demo/broker, with no page errors. Demo pages stay view-only mock data.

## Role-aware public demo invitations November 18
- [x] Default first email and official WhatsApp invitations to a public view-only demo link rather than shared login credentials.
- [x] Resolve all six saved user types to their matching public demo and route unknown types through a role-selection page.
- [x] Preserved the explicit personal-invitation alternative, consent, Meta approval and first-invitation claims; 21 focused tests, TypeScript and guest/admin browser checks passed, both functions deployed, no messages sent. The new WhatsApp wording still requires Meta approval before sending.

## Pending invitation identity and contact gender November 18
- [x] Keep the company/developer phone immediately beside its name in the first card row.
- [x] Hide contact gender choices until contact editing; show only a saved, color-coded selection in the closed card.
- [x] Eight focused tests, TypeScript and signed-in mobile/desktop checks passed with a measured 4px name-phone gap; browser-only contact fixtures were used for editing, with no database writes.

## Developer identity and automatic discovery November 18
- [x] Conservative normalized names plus service-only identity lease prevent parallel admin provisioning; account imports match within their workspace. Merged the two verified silent Karso company rows into the oldest workspace: three projects/five apartments preserved; redundant Auth account retained, not purged.
- [x] Added explicit automatic discovery toggle and target/project bounds for both tabs; developer directory feeds existing leased deep-import workflow. Source blocks fail visibly.
- [x] 46 focused tests including database identity locking passed; signed-in toggle/quantity controls checked on desktop/mobile; three functions deployed. Unpaid source read returned Radware, not real directory content; no new paid import was run, so live automatic developer discovery is unverified.

## Import performance and controls November 18
- [x] Bound authorized discovery to 50 seconds/three attempts, reduce redundant queue gap to one second, and continue running broker/developer jobs via the existing leased worker. Provider cooldowns, publication and identity rules remain unchanged.
- [x] Move icon-only new import to the heading; separate broker/developer selection with actual project caps and arrow quantity controls.
- [x] 43 focused tests passed; signed-in desktop/mobile tabs and quantity controls verified; three changed functions deployed. No new paid source scan or account creation was started, so full live import/provider reliability remains unverified.

## Inventory count flow sweep November 18
- [x] Read invitation cards/history, developer dashboard/import completion, Developers directory, workspace/sidebar count RPCs, public profile projection and both background workers. Directory first-project units are source facts, not imported-inventory totals; public projects remain publication-filtered.
- [x] Removed capped saved-row/history/page reads and zero-unit completion placeholders, refreshed both import flows and polled visible inventory counts. Twenty-one tests passed and real Shviro/Azorim cards verified again. No past jobs/inventory/publication/permissions changed; no new paid source import was run, so live worker completion remains unverified.

## Dynamic invitation inventory counts November 18
- [x] Count saved developer projects and apartment entries by developer_id using a service-only database COUNT RPC, without row-limit truncation or silent zero on errors; deployed protected invitation endpoint.
- [x] Refresh invitation/history/developer inventory queries when import progress is saved; eight focused tests pass. Real signed-in cards show Shviro 26 projects/1 apartment and Azorim 3 projects/2 apartments, checked desktop/mobile without runtime errors. No import, messaging or inventory writes triggered.

## Pending invitation card layout and deletion November 18
- [x] Keep identity, mobile and actions on one compact primary row; remove the mobile-required label.
- [x] Add confirmed exact-account permanent deletion using the existing protected deletion endpoint.
- [x] Keep secondary details and registry action on one non-wrapping truncated row; eight focused tests and mobile/desktop verification passed. No real account was deleted.

## Pending first invitation and 48-hour follow-up
- [x] Replace contact completion with uninvited imported broker/developer accounts and retain manual channel actions.
- [x] Track successful initial invitations and tokenized link clicks; queue one follow-up after 48 hours without a click/login using self-removing per-invitation schedules (up to one minute timing tolerance), not recurring polling.
- [x] Sixteen invitation tests passed; deployed schema/functions and real signed-in queue (10 accounts) verified; no real invitations sent. The follow-up queue is empty, so actual timed/provider delivery was not exercised. WhatsApp retains its approved link-less opt-in template; tracked links are attached only when the approved template supports a link.

## Import history actions November 17
- [x] Add Super Admin log-only deletion without removing imported inventory or queue jobs.
- [x] Use the official compact Yad2 symbol for source links.
- [x] Link identities to scoped inventory and companies to public pages, with return navigation and retained import tab.
- [x] Fifteen focused tests passed; signed-in developer inventory/public-page/return and deletion confirmation verified. Existing logs were not deleted during browser verification.

## Deep project apartments and stable expansion
- [x] Traverse supported exact-project inventory/unit descendants and pagination with parent-scoped merging in both deployed queues; preserve import pacing.
- [x] Display saved exact source milestones as a visual timeline and enlarge expanded project details by 2px.
- [x] Verified signed-in mobile/desktop headings remain below the header; 37 parser, queue, hierarchy and commission tests passed, preview build OK.
- [ ] Verify live source apartment inventory/timeline end-to-end: current saved projects have neither units nor timelines, and inspected cached Yad2 pages expose no inventory links. Source-specific dynamic inventory remains unverified; no paid re-import or invented units were created.

## Developer search and compact toolbar
- [x] Hide search until the hero magnifier is clicked; allow closing through its small corner X.
- [x] Keep developer logo/name, project count, icon-only sync and view toggle together on all devices.
- [x] Verified signed-in search filtering/close, sync entry and view switching at 320px, 411px and desktop; no toolbar overflow or page errors, 17 regression tests passed.

## Developer project table scrolling and commission entry
- [x] Keep the project table height bounded and vertically scrollable without an outer frame.
- [x] Open the existing project commission setup from all commission-cell content, including unconfigured fees.
- [x] Verified signed-in mobile scrolling (500px), desktop layout and commission entry with editable input; 18 focused tests passed. No saved commissions were changed during verification.

## Developer and direct-project imports November 16
- [x] Parse rendered Yad2 company/project HTML and structured project identities without the narrow company-name failure.
- [x] Accept direct project links in developer and Super Admin import boxes and queue them correctly.
- [x] Import exact source status/timeline fields and display them without changing internal publication status.
- [x] Preserve silent developer-only account provisioning; never invent partner verification, identity or consent.
- [x] Run focused parser/queue tests, apply schema, deploy workers and verify the preview build; no paid live import or account creation was triggered during verification.

## Yigal and Ben agency branding November 16
- [x] Fill Yigal's listing with the saved Anglo Saxon Herzliya square logo.
- [x] Fill all Ben Lagziel listings with the saved Tabu Nadlan name and Yad2 logo.
- [x] Verify public listing responses, broker profiles, community/admin table responses and loaded logo images.

## Account menu and Super Admin shortcut November 16
- [x] Flip full-name/company positions and reduce both menu label sizes from 17px to 15px.
- [x] Remove three orphaned duplicate entries while preserving the active Tal and Nuriel accounts and their properties.
- [x] Let the account list use the available screen height and scroll internally.
- [x] Make the Super Admin icon gold, borderless and 19px; verified 17 unique accounts, mobile/desktop layout and 17 focused tests.

## Multiple custom QR codes November 15
- [x] Add independent named QR destinations while retaining the original /go code.
- [x] Allow creating, selecting, editing and downloading each branded code with separate scan counts.
- [x] Verified two persisted codes, destination edits, independent guest redirects, desktop/mobile layout, 1024px PNG decoding and 11 regression tests.

## Profile hero and office address row November 15
- [x] Put office city, street and house number on one row at every width.
- [x] Remove the "הגדרות חשבון" hero title, leaving only the tabs, and tighten tab padding 7px top/bottom.
- [x] Verify mobile/desktop hero and address row, plus the address field test.


## Suppressed guide help icon November 15
- [x] Fade the sidebar question-mark icon to a lighter gray once that page's guide was explicitly suppressed.
- [x] Keep the icon clickable so the slides still open on demand.


## FAQ hero tabs November 15
- [x] Remove the selected FAQ subtitle and hero title.
- [x] Move both FAQ tabs into the blue hero without changing tab state or deep links.
- [x] Verify desktop/mobile layout and save with the pending broker-table work kept separate.


## Broker table agency identity November 15
- [x] Trace every broker/agent table row and reuse the authorized public-profile agency name/logo relationship.
- [x] Render consistent agency name and logo in each relevant broker row without exposing private office data.
- [x] Add focused relationship/rendering tests and verify the affected desktop/mobile tables.


## Loading and agency settings overhaul November 15
- [x] Keep the main header and loaded blue hero visible during every page loading overlay or skeleton.
- [x] Replace agency city fields with national city/settlement and street autocomplete plus a manual house number.
- [x] Restrict agency phone visibility to authorized system managers, including public projections.
- [x] Add instantly saved editable company description sourced from existing/imported agency profiles.
- [x] Rename the settings hero and move all four profile tabs into it; verify desktop/mobile and focused rules.


## Page explainer revamp November 15
- [x] Rewrote all shared page-guide copy with one bold title and relevant global icons per slide; added specific homepage and My Ads guides.
- [x] Automatic guides repeat on later visits until explicitly suppressed; manual help omits permanent suppression and leaves dismissal unchanged.
- [x] Added homepage and non-broker My Ads sidebar help; five tests and signed-in mobile first/repeat/suppressed/manual flows passed with one header, no generic content icon and no page errors.


## Unified signed-in Rita chat November 15
- [x] Matched signed-in mini/full Rita to guest presentation, greeting header, conditional clear, user/Rita avatars and alignment, with no redundant footer actions.
- [x] Added compact auto-growing input with Enter newline and Command/Ctrl+Enter send; send stays inside the input row for guest and signed-in chats.
- [x] Added visual-viewport keyboard adaptation; 11 focused tests and signed-in desktop/mobile checks passed with mocked replies, including visible inputs at 580px/587px within a 600px keyboard viewport and no page errors.


## Broker navigation and Partner onboarding November 15
- [x] Show broker menu in the exact requested order, including הנכסים שלי and a standard accessibility row; remove dashboard and activity history.
- [x] Add icon-only dashboard and activity-history destinations inside the header activity summary as full pages.
- [x] Verify first Partner entry requires saved terms approval and later entries bypass onboarding.
- [x] Fixed active-workspace broker license lookup for Super Admin workspace views; 24 focused tests and signed-in desktop/mobile navigation checks passed without page errors.


## Guest typewriter actions November 15
- [x] Replaced guest rotation with the ten requested messages and persisted each message's internal destination; the live database returns exactly ten active guest messages.
- [x] Increased rendered banner text from 14px to 15px and linked messages to signup, the explainer or FAQ; added the requested `/what-is-toraff` explainer URL.
- [x] Fourteen focused tests passed; mobile clicks reached visible explainer, signup and FAQ content without 404s or page errors, and mobile/desktop text measured 15px.

## Role-based rotating messages November 15
- [x] Added the typewriter banner between homepage search and view controls, with guest, broker/partner, developer and private audiences; signed-in broker targeting and guest animation verified.
- [x] Seeded exactly ten live messages per audience; a Super Admin edit appeared on a separate open guest homepage without reloading and was restored.
- [x] Added the Super Admin rotating-messages dropdown section with secure create, edit and confirmed delete; persistence, cleanup, 15 focused tests and mobile/desktop layouts passed.
- [x] Moved the open visitor sidebar's X to the burger icon's top-right corner; settled mobile placement measured at x407/y4 against the burger at x380/y11, with no page errors.

## Anonymous professional profiles November 15
- [x] Open professional and office routes, guest identity links and narrowly projected reads; keep personal profiles and all editing protected.
- [x] Verified real guest desktop/mobile office description and all five broker cards, profile navigation/back, two published assets and inline details; eight tests and live guest privacy checks pass. Private management and administrator routes remain blocked.

## Profile navigation and table fades November 15
- [x] Removed the profile office-return button; X returns to the previous page or homepage on direct entry. The office link is 14px with a dotted underline, and the view switch sits at the row edge.
- [x] Increased shared table fades from 20/36px to 30/46px on mobile/desktop. Four regression tests and authenticated mobile/desktop checks passed with no page errors.

## Visitor WhatsApp contact November 14
- [x] Added official WhatsApp introduction below visitor signup; mobile/desktop button and exact link verified.
- [x] Isolated public WhatsApp welcome sessions from CRM/tools; signed callbacks, atomic claims and quiet Super Admin-only alerts deployed.
- [x] Eight boundary/replay tests and six sidebar regressions pass; live AI welcome/follow-up and privacy refusal verified without sending. Forged callback returns 401. Actual incoming WhatsApp, administrator alert readback and recipient delivery await a real visitor message.

## Anonymous visitor navigation November 14
- [x] Aligned visitor controls under the header; ordered burger navigation opens signup, FAQ, four-slide explanation and canonical legal links.
- [x] Added isolated public-only Rita with one browser-saved conversation and menu-only peeking accessibility trigger. Three boundary tests and eight regression tests passed; anonymous live reply, private-data refusal, reload history, mobile/desktop explanation return and accessibility verified.

## Continuous developer import November 14
- [x] Added serialized automatic continuation to both import screens; authorized developer continuation shares server workspace/payment checks, leases and retry deadlines. Active developer jobs cannot be replaced from the frontend.
- [x] Refresh page-level progress after every step; seven runner/retry tests pass. Signed-in Super Admin mobile/desktop simulated four automatic steps through completion without errors; no paid source reads. Real provider completion remains unverified.

## Loader refinement November 14
- [x] Increase logo width 140→154px and subtitle 9→13px; reduce minimum to three seconds. Four timing tests pass; authenticated fast page measured 3.036 seconds.
- [x] Reuse centered page overlay while empty public/managed property results load, without covering populated background refreshes. Delayed live public feed retained the overlay until completion; mobile/desktop dimensions and position verified without runtime errors. Hosted video supplied locally for checks.

## Full-page loading scope November 14
- [x] Restrict video to full-page overlays, restore inline spinners and reduce the 280px/18px page presentation to 140px/9px.
- [x] Persistent overlay holds fast loads for five seconds plus a paint allowance and waits for slower loads; four timing tests pass. Authenticated import page/mobile/desktop verified, no inline videos or page errors. Hosted video supplied locally for browser verification.

## Custom loading video November 14
- [x] Replace shared icon, legacy ring and toast spinners with the uploaded video; crop excess bottom whitespace and add the requested subtitle.
- [x] Verify 768×220 muted looping playback, reduced-motion pause and mobile/desktop loader sizing without altering requests or permissions. Hosted assets supplied locally during browser checks; three pre-existing GroupStatusChips copy/markup assertions fail outside this change.

## Background developer project imports November 14
- [x] Replaced the direct long preview request with durable developer jobs and one queue row per developer/project page, authorized to the requesting workspace and active subscription; the legacy multi-page request is disabled.
- [x] Each invocation processes one 40-second-maximum page with a 55-second lease, automatic transient/429 backoff, crash-recovery watchdog, safe private upserts and live resumable UI progress; manual project edits and publication state remain preserved.
- [x] Added bounded desktop/mobile user-agent rotation without sticky sessions; retained exact-source parsing/cache and existing Super Admin background checkpoints.
- [x] Twenty-four focused tests, typecheck, authorization checks, queue-claim/watchdog checks and mocked mobile/desktop progress passed. Two no-network worker runs completed with project/company readback and full test cleanup. No paid full import was run.

## Horizontal table overflow fades November 14
- [x] Added semantic, pointer-transparent start/end fades to shared table scrollers only while more columns exist in that direction; 20px mobile and 36px desktop edges use the surrounding background.
- [x] Covered native tables and page-owned user-table scrolling without adding a scrollbar or changing expanded fixed panels, sticky headings or clicks.
- [x] Seven focused tests and typecheck passed. Authenticated RTL property tables on mobile/desktop and the page-owned user table verified at start/middle/end with correct one/two-sided fades and no page errors.

## Autonomous developer scraping November 14
- [x] Removed developer-job Continue/cooldown-reset breakpoints and added automatic retry countdowns; broker controls remain unchanged.
- [x] Developer page/project/unit checkpoints chain unattended; one-off delayed wake-ups retry transient failures and full 429 backoffs without tight loops. Permanent configuration/identity errors fail visibly instead of pretending completion.
- [x] Exact-source parsing, caches and private developer-owned saves are preserved; repeated account provisioning is source/job idempotent. Thirty-three focused tests, Deno/type checks, three deployments, mobile UI and a rolled-back delayed-schedule test passed. Verification triggered source reads and a temporary account, which was deleted; no projects, units, test jobs or retry schedules were retained. Full live completion remains unverified.

## Developer paid subscription November 14
- [x] Developer selection in free posting opens the monthly ₪9,500+VAT plan, diagonal grey ₪13,000 strikethrough, benefits and mandatory terms consent; guest return reopens it on the global homepage.
- [x] Self-workspace Grow/Make orders snapshot ₪9,500 + ₪1,710 VAT = ₪11,210 and server-timestamped terms. Only independently verified live completion grants the developer role and 30-day workspace entitlement; sandbox/redirects grant nothing.
- [x] Dashboard, project/company writes, publishing and Yad2 imports enforce active entitlement. Removed the fixed 20-page import cap; source failures remain visible and wallet credits stay separate.
- [x] Thirty-seven focused tests pass, both workers deployed, typecheck/build clean. Guest and authenticated desktop/mobile plan, auth handoff, disabled unconfigured checkout, unpaid lock and simulated active importer verified without page errors; no payment or source import performed.
- [ ] Real checkout, all five method completions, verified notification unlock and full live multi-page import require the live Grow/Make scenario, capabilities and secrets. Current gateway is sandbox with no declared usable methods; no live activation claimed.

## Grow-only settings and agency profiles November 14
- [x] Removed Z-Credit admin/customer card setup and dormant deployed endpoints, leaving Grow as the only payment configuration; historical payment records remain untouched.
- [x] Import Yad2 agency descriptions separately from personal bios, save only into empty office fields and expose an authorized exact-office/city description fallback. Both import workers deployed; no paid scan or source text invented.
- [x] Show every eligible same-office broker using exact office-name and city matching, with address separation when supplied. Twenty-eight focused tests passed; authenticated desktop/mobile verified Grow only, both real Anglo Saxon Herzliya cards, second-broker navigation/return and no overflow/runtime errors. Description placement checked with an intercepted read because no agency descriptions are currently stored.

## Pricing presentation November 14
- [x] Removed the requested closing explanation, updated landing-form labels, and let the pricing-only editor header scroll with its content; other page headers remain unchanged.
- [x] Added role-aware modal help to pricing cards and reversed the bottom heat-level presentation without changing price calculations or closing entitlement.
- [x] 59 focused tests passed; authenticated desktop/mobile pricing/help checked without horizontal overflow, and mobile editor heading moved 145px with scrolling. No prices or publication state changed.

## WhatsApp explicit property UUID routing November 14
- [x] Both official receivers resolve an explicit eligible public/live/unpaused property before phone history; sender-specific leads remain scoped to its workspace. Explicit traffic bypasses the legacy global-phone upsert and owner-companion routing, never another person's lead.
- [x] Exact property facts take priority through fast/slow/rescue replies; generic buyer fallback is replaced with a property-specific response. Existing autopilot gates remain; Green messaging stays retired under the standing official-only rule.
- [x] Five Deno routing tests, three Rita prompt tests and both receiver Deno checks passed. Both receivers deployed; unsigned Meta and unauthorized internal requests return 401. Real signed inbound event, AI reply and recipient delivery remain unverified; no WhatsApp message was sent.

## Profile and office presentation November 14
- [x] Shared dropdown items use +3px; chat action popovers add +3px to their existing modal scale. Profile, shared grid, expanded cards and homepage rows expose share/favorite only in menus.
- [x] Profile controls anchor at shell top on expansion/view changes without resetting columns; page close portals outside scroll ancestors with 22px X, dialog close stays sticky with 18px X.
- [x] Office grid shows avatars and counts from authorized listing IDs intersected with the redacted feed; individual profiles carry explicit office return and a city-row office link.
- [x] Nine focused tests and authenticated desktop/mobile populated-profile expansion, list/grid, menu font, fixed close, office count and explicit return passed; no overflow/runtime errors. The available roster has one broker, so live multi-broker layout remains unverified.

## Card menus and avatar-only profiles November 14
- [x] Lead/peer/group cards share target-bound header action content; directory cards reuse peer actions and saved rows have top-left menus. Clicks close menus while preserving favorite/block/delete confirmations; no destructive backend changes.
- [x] Lead/peer/header/directory/group sender/roster public profiles open only from circular avatars. Names/card bodies open conversations or remain text; authorized lead editing stays in the menu and unmapped leads never borrow account identities.
- [x] Five focused tests pass; authenticated four lead cards and ten peer cards checked, lead card/header options identical, delete confirmations cancelled, name/header/avatar navigation verified desktop/mobile, favorites row menu visible, no overflow/runtime errors. Populated group interaction remains unverified because the available account has no joined groups; shared group implementation updated without creating any.

## Rita autonomous messaging and conclusion actions November 14
- [x] Replaced draft-only Rita conversation instructions with authorized tools: direct official WhatsApp replies, internal Rita messages, follow-up tasks, known-property sharing and bounded lead stages. Existing incoming-message autopilot remains enabled-state gated; no Green messaging fallback or provider-window bypass.
- [x] Added server-owned actions with single-use claims, fresh target/workspace checks and persistent conclusion buttons; community delivery retains Rita identity and no private CRM tools. Explicit sends execute immediately; proposed next steps require a button click.
- [x] Seven Deno and four frontend tests pass; function deployed and actual authenticated model request plus tool-continuation/follow-up generated and read back a saved follow-up button. Desktop/mobile verified, mobile modal clipping fixed. Button invocation intercepted; no reminder, status change or external message executed.
- [ ] Actual recipient delivery and continuous two-party nurturing remain unverified without a consenting test conversation and valid Meta authorization. Outside the 24h window still requires compatible approved templates/consent; no unauthorized first-contact free text enabled.

## Wallet credit package slider November 14
- [x] Synchronized 5–2500 ILS slider/input, reached-threshold bonuses and credit/value display; unchanged four-credit conversion yields 20/210/880/2300/4800/12500 credits at requested tiers.
- [x] Applied immutable server bonus snapshots for new deposit orders; verified completion credits paid amount plus bonus once, while old orders/subscriptions remain unchanged. Deployed payment endpoint rejects out-of-range packages before creation.
- [x] Twenty-eight focused tests pass; authenticated desktop/mobile all six tier values, input/slider readback, keyboard endpoints and drag checked with no overflow/runtime errors. Server conversion=4, completion service-only, preview clean. No payment/SMS; live settlement still awaits existing Grow/Make setup.

## Payment method presentation November 14
- [x] Removed option unavailability badges; labels 14→18px, requested card/mobile copy and original Bit/Apple/Google/Mastercard assets. Bank transfer retains neutral bank symbol because no beneficiary bank/brand is supplied.
- [x] Tailored Bit/card/express-wallet/bank preparation forms and Make contract; card number/expiry/CVV and actual wallet/mobile verification/bank instructions stay provider-hosted. No sensitive-card collection or invented bank account.
- [x] Twelve focused tests pass; authenticated desktop/mobile all five preparation flows verified, no overflow/runtime errors, disabled live checkout preserved. Logo rendering verified by supplying original files to localhost asset requests (local Vite does not serve hosted asset URLs).
- [ ] Live method completion, Bit verification, express wallet sheet and bank instructions require working Grow/Make capabilities and provider integration; no payment/SMS performed. Hosted asset delivery outside localhost remains unverified.

## User management refinements November 14
- [x] Email invitations follow upgrade requests; empty queues hide, query failures remain visible. Toolbar and invitation/consent row actions use labeled icons.
- [x] Expandable search includes saved-role/access/gender filters and active-only clear; shared Table page mode removes nested scroll ownership while retaining column customization and native sticky headers.
- [x] Nine focused tests pass; authenticated 14-user desktop/mobile page verified search/clear/filter window, add-user open/close, no empty cards or runtime errors. Mobile page scrolled 521px from inside table, pinned heading and final row reachable; no accounts or messages changed.

## Wallet top-up cleanup November 14
- [x] Removed gateway credentials/testing controls and saved-card setup from customer top-up; Z-Credit configuration is mounted only under Super Admin payments.
- [x] Added all five method choices and minimal amount/provider-declared customer fields plus receipt mobile; single secure-payment action opens hosted Grow checkout.
- [x] Added purpose-separated authorized-wallet deposit orders; independent Make verification credits the exact snapshotted wallet once, with existing paid-only SMS dispatch and no subscription entitlement/card mandate.
- [x] Ten focused tests pass; authenticated desktop/mobile customer selector and unavailable payment state checked, intercepted Bit capability/form validates 200.25 ILS and mobile without payment, no overflow/errors. Real Super Admin terminal/API fields visible only in payments; worker deployed, preview clean.
- [ ] Live deposit and SMS delivery require live Grow/Make credentials, enabled method capability mapping and notification secret; all actual methods currently unavailable. No charge or SMS performed.

## Chat header channels and matching lists November 14
- [x] Moved channel count/filter controls from previews into the open lead header, aggregating the selected thread's authorized IDs.
- [x] Shared stable 18px/600 name/header and 16px preview/subtab typography across lead, peer and group lists; timestamps unchanged and existing main tabs identical.
- [x] Removed lead/peer/group list enclosure frames and side borders; SwipeChatCard owns horizontal between-row dividers.
- [x] Nine focused tests passed; authenticated 1280×1800 and 411×801 populated lead/community views verified, zero preview badges, header counts Facebook 236/WhatsApp 26 and functional toggle. Names read back 18px/600 in both tabs, no overflow or runtime errors; no messages sent. Group styles share implementation but populated groups unavailable.

## Lead form and first official WhatsApp November 14
- [x] Clean lead fields and replace kind buttons with a dropdown; unspecified gender remains neutral, never name-guessed.
- [x] Preserve background Green API avatar hydration after phone save; secure all avatar paths by caller/workspace and unchanged phone. Existing DB phone-write trigger verified.
- [x] Return chat-origin saves to the saved conversation; dedicated official first-contact endpoint requires approved exact opt-in template, genuine empty WhatsApp history and unique workspace/phone claim, with no ambiguous-send retry.
- [x] Authenticated desktop/mobile form checked, real isolated lead saved and chat reopened; test row removed. Provider send/avatar intercepted to avoid external delivery. Focused tests added; preview clean.
- [ ] Live first-message delivery needs Meta approval and synchronization of dedicated toraff_contact_opt_in Hebrew template; existing templates are unrelated. Actual recipient avatar import and message delivery remain unverified without a consenting test recipient and working provider authorization.

## Rita filtering and swipe actions November 14
- [x] Rita counter/filter use the same global+per-lead enabled predicate, not last-message author; disabled rows disappear immediately. Saved per-card toggles read back after reload.
- [x] Shared touch/desktop swipe reveals red delete, yellow favorite and blue Rita actions in lead/private/group cards. Lead message deletion preserves CRM identity; Community removal hides only caller's card. Group autopilot is owner-only; phone-only orphans cannot enable it without a lead identity.
- [x] Community incoming-message triggers invoke service/cron-authorized rita-conversation, with source-message deduplication, setting/membership/block/owner rechecks, shared Rita logs and no synthetic participant messages. Direct table writes and anon reads revoked.
- [x] Seven focused tests and Deno check pass; authenticated desktop/411px touch gestures, deletion cancel, lead/peer toggle persistence and Rita count=2/rows=2 verified. Deployed endpoint rejects forged automatic requests with 403. No messages sent or histories deleted.
- [ ] Real automatic community reply and populated group gesture verification need an authorized fresh incoming test message/group; neither was created in existing conversations. Automatic generation is implemented but not end-to-end verified.

## Chat usability and contact restoration November 14
- [x] Removed selection UI/dead batch paths; content typography increases 2px excluding timestamps, with Community-style toolbar and כל הצ'אטים label.
- [x] Menus close on captured action clicks while preserving nested dialogs; favorite removal is confirmed and favorites replace pane content, not a modal. Expanded filters alone show result action.
- [x] Default-on per-chat channel counts/gray toggles hide disabled messages immediately (Facebook-off left 26 WhatsApp messages). Bordered sending-channel selector, no composer microphone, WhatsApp-style Rita send; original authorized LeadCRM sheet opens from lead name/avatar with verified public-profile return.
- [x] Eight focused tests pass; authenticated desktop/mobile layouts, details, public return, Rita menu, favorite confirmation/cancel and filtering verified without page errors. No messages sent or contact fields changed.
- [ ] Public bio/marketed assets for lead contacts: existing lead projection has no verified platform-account mapping. Do not invent an account UUID; requires an authorized identity association before linking community assets.

## Chat screen cleanup November 14
- [x] Removed hero search/favorites and lead-card channel/delete/favorite icons; cards use RTL and All/Rita sit between toolbar favorites and selection/search. Waiting is removed; All still includes incoming chats.
- [x] Authenticated populated desktop/mobile cards, All/Rita switching, inline search, selection badges/counter and favorites modal verified without page errors. Nine focused tests pass; preview build clean.

## WhatsApp attachment lookup November 14
- [x] Missing credentials now return HTTP 200 with available=false and authorization_required after message authorization, not 503. Actual reported request and renewal bubble verified while signed in, without page errors; six tests pass and function deployed.
- [x] Media credentials match the saved receiving phone, exclude explicitly unauthorized rows and distinguish inaccessible media from provider failures. Diagnostics omit tokens/URLs; media caching is private.
- [x] Inline loading/unavailable/retry verified on the actual August 25 attachment in the authenticated conversation, without page errors; five tests pass, function deployed and build clean.
- [ ] Restore playback of the reported attachment: the matching official provider is marked authorized=false and no matching central credentials are available. Requires renewed valid WhatsApp authorization; the old attachment may also be unavailable at Meta.

## Chat list toolbar and selection badges November 14
- [x] Moved search/selection to toolbar start and favorites to opposite edge; centered channel badges appear only in active select-all row, with bulk actions wrapping below on narrow screens.
- [x] Authenticated desktop/mobile verified inactive/active selection, select-all counter, inline search and favorites modal; four shared-control tests pass and preview build is clean.

## Chat actions and live receipt redesign November 14
- [x] Removed bubble stars; whole peer/lead/group favorites live in header action menus, with existing saved messages preserved. Group favorites retain membership/workspace checks and open their group tab.
- [x] Shared vertical three-dot popover contains prior header actions, including labeled Rita/deal terms controls. Physical outgoing-left/light and incoming-right/primary contrast applies to lead/private/group/channel bubbles; removed inherited AI message layout overrides from lead bubbles.
- [x] Added data-free private receipt doorbells only on actual delivery/read transitions; sender refetches receipt state immediately, with polling fallback and no message-refetch/acknowledgement loop. External ticks still require provider metadata. Sixteen tests pass; authenticated populated private/lead menus and star-free bubbles checked desktop/mobile without page errors; peer chat favorite saved/read back. Live two-account read transition and populated group rendering were not exercised; no messages sent.

## Gender-aware localization and clean chat cards November 14
- [x] Removed empty-history label; inbox add icon 20→26px and control 36→46.8px, exactly 30% larger.
- [x] Community/directory/office/profile titles use saved subject gender via authorized projection and shared role formatter. Shared UI commands/recipient slots remain active; Rita conversation gets participant-specific grammar. CRM/automated lead gender no longer guesses from names; approved template text/user messages remain unchanged. A shared hook exposes gender-aware personal roles; partner success/error notifications updated.
- [x] Seventeen focused tests pass; authenticated populated desktop/mobile cards checked, exact icon/control dimensions verified and authorized gender RPC returned 200 with no page errors. Rita/WhatsApp/IVR affected workers deployed. Existing every-page prose and every notification/template have not been exhaustively converted or live-verified; no AI responses, calls or messages generated.

## Chat card navigation and genuine receipts November 14
- [x] Card bodies open chats; only avatars open public profiles; favorites remain separate. Authenticated community body/avatar navigation verified desktop and mobile; directory invitation pickers remain explicit actions.
- [x] Recipient-authorized receipt storage/RPCs acknowledge fetched delivery and visible active-chat reading. Incoming unread previews are bold; outgoing previews normal. Shared WhatsApp-style ticks in inbox/private/group/channel bubbles use actual receipt/provider evidence, removing inferred reads and default-delivered states.
- [x] Fourteen focused tests cover sent/delivered/read, incoming-only bold, visible reads, hidden panes and sender restrictions. Authenticated populated inbox/community checked without errors; existing messages showed outgoing ticks. Two-account live delivery/read transition and new incoming arrival remain unverified; no messages sent.

## Universal inbox stars and header alignment November 14
- [x] Persistent outlined/filled stars on all private chat/community rows, including new contacts and phone-only recovery threads; message/modal icons match. New community favorites remain role-gated, orphan favorites reuse authorized message access.
- [x] Contextual search/favorites flank centered hero tabs at 1280×1800 and 411×801. Authenticated chat/member saves display in modal, community save survives reload; six focused tests pass, no page errors, preview build OK. Read-only gateway refused SQL-context authorization tests; new-contact save verified through authenticated UI instead.

## Connections and inbox refinements November 14
- [x] Facebook business/groups rows show coming soon; removed duplicate labels above connection fields. Shared hero and targeted campaign header use 10px top/bottom spacing, centered titles and horizontal actions.
- [x] URL-driven hero chat/community tabs preserve mounted panes; add opens existing full client form or community directory (including from groups). Animated inline search uses X, distinct chat/member filters and conditional top-left clear buttons; shared board/global search/filter windows updated.
- [x] Added personal account/workspace-keyed chat/message/peer favorites under RLS target checks; row/message and batch actions share the same list/modal. Real chat and message saves survived reload and displayed in modal; test-added favorites removed afterwards. No messages sent.
- [x] Sidebar renamed and question marks survive dismissed guides; shared tutorial registry, walkthrough, product-tour and relevant partner/connection help refreshed. Thirteen focused tests pass; authenticated desktop/mobile header, add forms, search/filter/clear flows checked; manual dismissed guide reopens and Facebook badges verified; preview build OK. Individual unrelated inline tooltips were not exhaustively rewritten.

## Compact profile rows and stable expanded actions November 14
- [x] Lead profile icon moved to top action row; separate authorized lead-profile page returns to full details with history-entry selection, never treats a lead UUID as a platform account. Community unchanged.
- [x] Profile list reuses compact homepage summary cells, with no collapsed images/publisher details; grid unchanged. Inline details retain gallery and bottom contact actions outside clipped expansion.
- [x] Shared FixedTablePanel uses native sticky inline anchoring, without event-driven transforms or gesture scrollbar toggling. Ten focused tests pass; populated authenticated desktop/mobile profiles show zero body drift over 20 horizontal frames, stable sticky contacts at three vertical positions, functional list/grid toggles and lead profile return; latest preview build OK.

## Global publisher profile links November 14
- [x] Shared cards/table publishers, expanded/standalone/shared details and legacy affiliate cards link through authorized original identity targets; imported ads require unique source-evidenced license mapping, never importer/name guesses. Managed search publisher links retain matching office/user IDs from authorized records. Developer company displays use saved owner_user_id.
- [x] Existing directory/person links retained; chat office text and profile office logo/name linked with separate actions. Office pages show saved branding and authorized owner when no matched roster exists. Eleven focused tests pass; real homepage publisher/profile and populated office logo/member/close-return checked desktop/mobile without page errors. Existing profile access still requires sign-in; private/unmapped external advertisers remain unlinked, no contacts exposed.

## Global expanded property scrolling and profile mode November 14
- [x] Remove global expanded-row horizontal lock; shared fixed bodies preserve horizontal column position on reveal, and new summary touch gestures clear prior body locks. Legacy property notes also use the fixed viewport panel.
- [x] Ten scrolling/reveal tests pass; authenticated populated profile reload/list-grid-list/inline expansion and real homepage native header wheel scrolling checked at 1280×1800 and 411×801: columns move 180px, body X/width stay fixed, no page errors. All inline property tables share the corrected owner; card-only lists stay in page flow.

## Lead details and distribution backlog November 14
- [x] Direct authorized lead details from CRM/inbox; optional public profile closes back to mounted details. Real lead checked desktop/mobile; community behavior unchanged.
- [x] Existing Facebook group queue reserves sequential days/slots against group/page/account caps, posted counters/completed jobs and pending reservations; existing worker tick checks due backlog.
- [x] Once-per-day channel-specific in-app advice when backlog exceeds daily capacity; ten isolated database rule tests plus seven existing access/capacity tests. Workers deployed, service-only functions read back. No actual posting or live multi-asset distribution performed; other channel types retain their existing delivery rules.

## Profile view and zero commission labels November 14
- [x] Replace zero commission wording with 0₪ without changing reward visibility.
- [x] Use the shared opposite-view toggle, list default and one inline expanded property at a time.
- [x] 41 affected tests pass; real populated profile click/inline details/close/grid-list switch checked desktop/mobile without popup, overflow or page errors.

## Grow saved cards and lead auto-billing November 14
- [x] Explicit unchecked customer mandate; save only provider-vault references after independently verified live card payments, never raw card data or noncard methods; safe card display and self-only revocation in Wallet.
- [x] Server-priced background authorization jobs on fee/cap save: highest lead bid ×5 or explicit daily spend cap. Persist results, verify scoped operation/amount, release hold through Make, no claim of total credit-limit visibility. Only permitted idempotent token-authorization capabilities run; raw tokens stay in provider vault.
- [x] Ten focused tests pass; signed-in card checkout mandate checked mobile with intercepted provider offer, unchecked default and no overflow. Migrations/trigger presence read back, workers deployed and preview OK. No actual tokenization/hold/charge performed; live provider verification requires Grow/Make setup.
- [ ] Exact-cost, idempotent low-wallet settlement with no wallet movements and transparent payment history requires working Make token-charge/status/release routes and Grow delayed-payment permission; no speculative live settlement enabled.
- [ ] Existing wallet lead billing remains unchanged until direct-settlement, disputes/refunds, partner reward release and daily budget reservations are tested with actual provider support. No wallet guard bypass or deletion of partial remaining funds. Grow/Make credentials remain unavailable.

## Super Admin credit balance editing November 14
- [x] Per-user exact balance editor with server Super Admin checks, central conversion, atomic ledger delta and stale-balance conflict protection; missing wallets initialize only on confirmed save.
- [x] Affected wallet/account queries refresh after save; active customer wallet polls every 10 seconds. Two focused tests cover zero/fractional/invalid values and scoped exact-save payload; live function definitions/guards read back. Authenticated real Users table loaded balances, blocked negative value and saved unchanged 100-credit balance through real RPC with table readback; mobile editor fits. Preview OK, no funds changed. Cross-account denied-role path source-audited, not impersonated.

## Minimal checkout and payment SMS November 14
- [x] Minimal method selector and gateway-declared customer fields; sensitive payment fields remain on Grow checkout. Unsupported methods disabled rather than invented.
- [x] Verified live-payment SMS outbox, atomic claim and provider result tracking; sandbox sends no SMS. Ambiguous/interrupted delivery requires operator review, never blind retry.
- [x] Seven focused safeguards pass; signed-in wallet checked desktop/mobile with intercepted gateway capabilities/create: Bit omits name, bank fields validate, secure link returned, no overflow. Preview build OK; migration applied and function deployed.
- [ ] Real checkout/method availability and SMS delivery need the existing Make credentials/terms plus capability mapping. No charge or SMS sent; current Make connection remains unconfigured. Hosted Grow fields/branding are provider-controlled; legacy orders without customer mobile cannot receive a summary.

## Profile clicks and contact permissions November 14
- [x] Lead/community/sidebar avatar and name entry points open clean profiles first; server-authorized management and own-client phone, contact-free peer profiles, internal official WhatsApp routing, 20px header/action spacing.
- [x] Five focused tests pass; real signed-in self-profile → self-settings and lead profile → authorized edit verified desktop/mobile without writes. Server readback returns no unknown-lead rows; preview OK. Full SQL multi-account test retained but sandbox SQL role cannot execute auth-only RPCs; no permissions weakened to run it.

## Independent expanded table scrolling November 14
- [x] Restore native horizontal scrolling for table summaries; shared FixedTablePanel keeps expanded property/project bodies and contact actions at viewport width and counter-scrolls them independently.
- [x] Four focused scrolling tests pass; real signed-in homepage property checked at 411×801 and 1280×1800: summary scroll -180/-150, expanded body X unchanged and width matches viewport. Preview build OK; developer table shares the fixed panel but populated project flow is unavailable.

## Unified profile and popup property cards November 14
- [x] Profile list/grid and office assets reuse homepage StandardPropertyCard; remove profile mini-cards and duplicated quick-share row, retain authorized menus/favorites.
- [x] Standard cards, public detail pages and popup/expanded details share PropertyGallerySlider. Expanded details default to authorized photos/share/favorite; partner popup removes duplicate copy/pricing block and retains shared pricing trigger/contact row.
- [x] 35 focused tests pass; real populated profile and homepage cards checked desktop/mobile, next image 2/6, image enlargement, thumbnail selection and no overflow/runtime errors. Preview build OK. Partner popup source shares verified gallery; actual partner popup opening remains unverified because the available affiliate screen does not expose a property popup action.

## Complete open tasks November 14
- [x] Implement Grow via Make admin settings, self-owned checkout/notification contract, atomic payment-backed subscription records and conditional wallet purchase UI; unconfigured credentials/terms remain disabled.
- [x] Audit older open tasks and finish actionable dedicated campaign UI/sender routing and IVR recipient diagnostics; older paid/provider/publication/identity checks remain blocked as recorded below.
- [x] 44 focused tests pass; authenticated Grow sandbox settings saved/reloaded (enabled=false, no duration), email sender gate checked; mobile SMS has no attachment/preview duplication, viewport-bottom send bar above footer and no horizontal overflow. Workers deployed; build OK. No charges/messages/role changes/publication.
- [ ] Make scenario and separate sandbox/live webhook credentials plus notify shared secret are not supplied. Implementation contract: docs/grow-make.md. Subscription duration/benefits/renewal require owner decisions; no invented package or renewal enabled.
- [ ] Positive paid subscription activation, genuine IVR delivery, two-party community/Rita, historical bios/developer projects, provider scan results, Meta grants/publication, signup OTP/certificates, privileged rollback tests and historical costs/resource metrics need the external data/permissions/consent listed below. No false completion recorded.

## Public profile refinement November 14
- [x] Remove blue hero/title/back, place top-left Close, use 15px header-to-avatar spacing and display raw license; opt out of global heading hiding.
- [x] Save separate custom public bio; show 50+ character custom or source-attributed imported bio without a title above Send Message. Broker and developer import pipelines retain source bio without overwriting custom text or reusing private AI persona text.
- [x] Add same-office member/property directory and link for multiple matched members; matching requires saved brokerage name plus matching city/address, never an unqualified brand-name match.
- [x] Show developer projects through an allowlisted projection gated by existing published/live/unpaused project listings, never expose raw project data or auto-publish private developments.
- [x] 37 tests passed; authenticated desktop/mobile verified visible name/license, no hero/overflow, original bio save and reload, build OK; import workers deployed.
- [ ] Populated shared-office/developer-project flow and historical imported biographies require real matching office data, published developer projects and source biographies; no published developer projects or imported bios currently exist. No paid re-scrape or public publication performed.

## Grow payments November 13
- [x] Super Admin payment section adds Grow environment, business ID, phone and sending mode, configuration saving and no-charge test contract; OTP stays in Make, private webhook keys never appear in the panel.
- [x] Deployed server-created links and independently verified/idempotent notification contract through Make; approveTransaction acknowledges receipt. Missing Make scenario/keys prevent live execution.
- [x] Add separate ₪6,500 subscription order/entitlement records and purchase confirmation. Sandbox cannot grant live entitlements or wallet credits; custom terms remain unset and checkout disabled until supplied.
- [ ] Implement actual benefit entitlements and any renewal only after duration/benefits/renewal are specified; never grant broker licenses or bypass credit/workspace checks.
- [ ] Verify sandbox checkout and notification readback once Grow credentials are available; never treat a success redirect as proof of payment.

## Public profile layout November 13
- [x] Standard blue header with full-name title, Close/Back, centered avatar with full-screen preview, name/role/license and saved service cities.
- [x] Separate office identity box, remove duplicated activity section and outer profile/list frames, show authorized active-asset count. Existing public profile data provides one city, not a separate office operating-city list; display the available city without inventing others.
- [x] Four focused tests passed; real Doli profile verified at 1280×1800 and 411×801 with four authorized assets, no horizontal overflow and full-viewport avatar preview. Back returned to community inbox and exact nonzero list scroll (80→80); no user/listing data changed.

## Expanded list scrolling and WhatsApp share November 13
- [x] Lock the shared listing scroll owner horizontally while any property row is expanded; retain vertical and gallery scrolling, restore horizontal movement after all close.
- [x] Replace property WhatsApp template controls with automatic compatible approved-template selection, populated read-only preview and Send; reuse preview links/parameters for official delivery. Recipient name/phone remain necessary for direct delivery. Existing named property-alert template includes the landing link in its address variable without changing approved fixed text.
- [x] Authenticated real-property desktop/mobile expansion, vertical scrolling, horizontal lock/release and populated share preview checked. Delivery uses focused mocked gateway tests; no real recipient messaged. Existing approved batch template is unavailable in the current workspace, so batch WhatsApp sends fail closed rather than use an unrelated template.

## Multi-selection pricing November 13
- [x] Selected-assets publication opens shared lead prices and separate sale/rent closing settings, with individual overrides and retained untouched fields.
- [x] Single/bulk publication share zero-price detection and concise warning; inventory publication requires broker-only confirmation before saving.
- [x] Focused tests passed; authenticated desktop/mobile selection, shared pricing, individual entry and canceled zero warning verified. No live distribution changed; actual saves/publication exercised in tests.

## Publication pricing and pause confirmations November 13
- [x] Open saved pricing before inventory publication, save every confirmed setup before publishing, and show pricing again in the publisher's final confirmation. Creation/import remain private until explicit publication.
- [x] Route legacy partner activation through the same setup and require a cancelable impact warning before pausing distribution.
- [x] 25 focused tests passed, including save-before-publish, failed saves and pause confirmation/cancel. Build OK; authenticated real-listing pricing and pause warning checked on desktop/mobile. Actual publication/pause writes verified in tests only; no live asset distribution was changed.

## Rewards popup refinement November 13
- [x] Clarify advertiser commitments, hide closing sections without existing server-confirmed broker eligibility, remove daily targets from read-only pricing and add the shared price-level legend.
- [x] 23 focused pricing tests passed; build OK. Authenticated real-listing popup verified on desktop/mobile, including licensed closing prices and scrollable heatmap without horizontal overflow; non-broker hiding covered by tests.

## Community groups and broadcast channels November 11
- [x] Extend existing groups with descriptions, discussion/broadcast mode, owner-managed invitations and durable unread counts; broadcast posting and Rita require the owner server-side.
- [x] Update creation, managed/joined lists and chat; existing private broadcasts refresh authorized queries, and read cursors advance only in a visible active group.
- [x] Eight focused tests passed; database columns/policy read back, Rita deployed and build OK. Authenticated desktop/mobile showed no overflow and correctly denied ineligible creation; modal checked with eligibility intercepted, no writes.
- [ ] Successful group creation, member invitation, unread clearing and two-user live chat require an eligible agent/broker/developer session; the injected account is ineligible. No real members messaged or roles changed.

## Rita in private and community conversations November 11
- [x] Add member-managed groups, member-only messages/rosters and server-written Rita interaction logs with RLS; private data-free updates include groups and assistant logs.
- [x] Add summon controls to lead/private/group conversations with streaming answers, summaries and lead guidance, saved history and Stop; no external sends or automatic CRM writes.
- [x] Five tests passed; authenticated temporary lead Rita reply returned 200, persisted and retained context on follow-up; mobile dialog/group navigation checked without overflow/errors. Forged assistant inserts, non-owner member edits and non-member roster access rejected; test lead/logs removed; function deployed and build OK.
- [ ] Positive group creation/member messaging and Rita-in-group flow need an eligible agent/broker/developer session; current injected account has no community role. No real users messaged or roles changed.

## Inbox conversation tabs November 11
- [x] Add property/lead and community tabs with independent mounted conversation state and per-peer drafts.
- [x] Private data-free per-user broadcasts refresh authorized queries; community participant RLS, server-role directory and send checks applied. Four tests passed; authenticated desktop/mobile switches and invalid self-message rejection verified, no overflow/errors; build OK.
- [ ] Successful two-party send/readback and live event receipt need an authorized agent/broker/developer session; current injected account has no eligible community role. No messages sent to real users.

## Discovery performance November 11
- [x] Extract summary-card volume and filter against configured bounds before enrichment; unknown counts still require inspection.
- [x] Scope directory pagination to Herzliya and Tel Aviv; retain sequential pacing and checkpoints, migrate old scanning checkpoints safely.
- [x] Add service-only seven-day checked/disqualified registry; 48 focused tests passed, both workers deployed, preview build OK. Database readback confirms RLS and no anon/authenticated grants. No paid provider scan; live filtering and provider geography remain unverified under the existing live-import task.

## Agencies directory import November 11
- [x] Remove subtitle; use directory pages and scoped agency detail enrichment with separate cache keys and retained pacing/contact fallback.
- [x] 39 parser/queue/transport tests passed; both workers deployed and signed-in mobile verified subtitle removal; preview build OK.
- [ ] Live directory-to-broker/draft import remains unverified: no paid provider scan was run, and ordinary public fetch returns a challenge. Office-only cards never create invented personal identities; creation still requires explicit person/license and enough attributed listing links.

## Import resume and fresh pagination November 11
- [x] Skip daily-restricted/busy listings without pausing; persist the next pointer and keep provider 429 protection.
- [x] Start a fresh job with reset counters/search pages, safely retire old jobs only outside active leases, and remove the requested heading. Existing drafts and detail caches remain intact.
- [x] 28 focused tests passed; migration applied and queue worker deployed. Authenticated desktop/mobile verified real queue reads, parameter reset and Resume/New request payloads with writes intercepted; build OK. Paid live resume/new-job scraping was not run, so provider-to-draft end-to-end remains unverified.

## Manual user creation placement November 11
- [x] Move unchanged manual creation form out of broker import into an animated toggle under the users table heading, with the add button opposite the title.
- [x] Authenticated desktop/mobile verified opening, closing, invalid-phone save blocking and form absence from import; preview build OK and no page errors. Existing fields/save logic unchanged; no real account created.

## Web Unlocker audit November 11
- [x] Inspect exact request, cache TTLs, pacing, license-first completion and live failure logs.
- [x] Pin requested zone web_unlocker4, add sanitized request/response diagnostics, distinguish local daily limit from provider 429 without bypassing the limit.
- [x] 40 focused tests passed; live cache holds 1 fresh search page (4 hits) and 8 fresh details. No Bright Data-created broker rows exist, so full account/draft completion remains unverified without a successful paid import.
- [x] Both workers deployed; preview build OK. Completion endpoint rejects unauthenticated requests (401). No live provider request or authorized end-to-end account/draft creation was exercised.

## Web Unlocker request schema November 11
- [x] Use exact POST JSON body zone/url/format:raw and Bearer environment credential, supporting the existing saved key name.
- [x] Preserve existing raw HTML parsers, license-first missing-contact fallback, cache and checkpoint logic.
- [x] 36 focused request/parser/error/license-first tests passed; yad2-unlocker deployed and preview build OK. No paid live scan or end-to-end provisioning was performed.

## Bright Data managed transport November 11
- [x] Remove the three requested import/contact explanatory paragraphs.
- [x] Prioritize managed Web Unlocker HTML, retain managed Browser fallback, and route short-link resolution through Unlocker; preserve checkpoints and license-first pending contact. Internal status checks now authenticate service calls, bypass public cache and reject challenge/error shells.
- [x] 38 focused tests pass; three workers deployed, syntax and preview build OK. Authenticated mobile import tab/modal checked with all three texts absent; no paid scan started, so live provider success/429 prevention is unverified.

## Manual Bright Data cooldown reset November 11
- [x] Add confirmed Super Admin-only reset, clearing cooldown/error/retries while retaining paused status, checkpoints/cache and actor/time audit.
- [x] Keep REST requests non-sticky with provider-managed rotation and bounded peer diagnostics; no unsupported session parameter or guarantee of unique IPs.
- [x] Both workers deployed; 16 focused tests passed and build OK. Authenticated mobile performed real reset on isolated paused test job: retries 3→0, deadline/error cleared, page 7/cache hits 5 retained, Resume enabled. Test row removed without starting a paid scan. Live peer rotation remains unverified without provider requests.

## Low-frequency Bright Data processing November 11
- [x] Replace four-second pacing with a strict twelve-second sequential gap and delay-only steps.
- [x] Pause immediately on 429 with minimum five-minute persisted cooldown and manual-only resume.
- [x] Migration 0151 enforces cooldown in authorized control RPC; 19 tests passed and workers deployed. Authenticated mobile verified mocked paused countdown (299→297 seconds), blocked Resume and retained cache totals; build OK. Real provider 429/resume not exercised.

## Bright Data pacing November 11
- [x] Serialize provider fetches with a 4-second gap, keep one page/detail per leased import chunk, and preserve cache bypass.
- [x] Persist exponential 429 cooldown and bounded automatic retries with countdown; manual pause/resume retains checkpoints.
- [x] 18 focused tests passed and workers deployed; authenticated mobile import card verified with real read-only data and mocked 429 countdown (39→37 seconds). Build OK; paid provider retry/provisioning not exercised.

## Bright Data timeout and diagnostics November 11
- [x] Extend provider REST/browser requests to 120 seconds with enclosing response grace and credential-redacted status/payload logging.
- [x] Retain existing checkpoint/cache-based resume and explain the longer wait in import progress.
- [x] 12 focused transport/error/checkpoint tests passed; both workers deployed and preview build OK. No paid scan or real resume was run; live provider timeout/retry remains unverified. Local Deno check unavailable due package resolution.

## Automated admin workspace and broker import November 10
- [x] Simplify silent user creation with type selection and server-checked registry/manual fallback.
- [x] Replace pasted batches with target/min/max discovery, detail enrichment and durable per-broker/per-listing checkpoints.
- [x] Background progress and atomic pause/resume deployed; authenticated desktop/mobile verified parameter dialog, modal-independent real scan, pause/resume and paused readback after reload. Real registry 31927721 returned matching canonical name/city; no messages sent.
- [ ] Full discovered-broker provisioning/import cycle remains unverified; the real one-broker test is intentionally paused after three scan pages with zero accounts/listings created. Complete provider identity extraction and safe successful provisioning readback still need verification.

## Open marketing table scrolling November 10
- [x] Bound the marketing page to the existing shell and shared native two-axis table scroller, keeping title/controls/footer stationary.
- [x] Seven scrolling tests passed; authenticated 1280×1800 and 411×801 table wheel scrolling moved both axes while shell/document stayed at zero; native mobile touch swipes passed both axes with real rows.

## Inventory collection phase November 10
- [x] Add dismissible shared home/public-board notice with browser-persisted dismissal.
- [x] Keep social connections, GoLogin and network marketing visible with preparation dialogs; inventory import/edit/publication and existing server jobs unchanged.
- [x] 42 focused tests passed; public and authenticated home notice, reload dismissal and connected-account desktop/mobile preparation dialogs verified with no page errors. No external connection, property write or publication performed.

## Official broker invitations November 10
- [x] Add Super Admin official-send preview and editable template submission/status from the official number.
- [x] Track accepted invitation, authenticated entry and pending inventory approval; My Properties shows the current stage.
- [x] 13 focused tests passed; deployed authorization rejects invalid sessions; mobile admin dialog verified. Default template submitted and Meta returned REJECTED, so no invitation was sent.
- [ ] Real official sending needs a Meta-approved wording and a consenting broker.

## Inactive Yad2 imports November 10
- [x] Shared preflight and queued draft/skip prompt across pasted link, publisher, agency and search-result imports.
- [x] Manual inactive-listing saves allowed; exact-source deduplication and publication-transition safeguards retained in migrations 0140/0141.
- [x] Hide missing advertiser placeholders and fill internal editing gaps from the signed-in verified broker profile; public source attribution unchanged.
- [x] Authenticated mobile verified simulated inactive status/skip; real selected-property unchanged save returned 204 and reload succeeded. Focused tests cover unpublished draft payload; fresh removed-source draft creation and scrape remain unverified.

## Shared lead question configuration November 10
- [x] Shared expandable question/form-field builder added to publisher, reward and quick-publication lead cards.
- [x] Preserve per-channel defaults, explicit removals and custom field types in scoped saves and reward drafts.
- [x] Authenticated mobile/desktop verified form addition and WhatsApp/phone edit/add/delete with no page errors or real publication. Focused save-payload tests cover persistence; real question save/capture not exercised.

## Compact publication pricing November 10
- [x] Replace fee summary labels with icons and pencil expansion; remove account-limit editor and requested publication paragraph from this dialog only.
- [x] Per-tier limits default to blue underlined links, edit on click and return selected numbers to links; smaller input placeholder.
- [x] Seven focused tests passed; authenticated mobile verified draft limit 7 and four expanded sliders without saving or publishing.

## Property editing and expanded-card polish November 10
- [x] Authorized table pricing opens the existing editor with all four sliders and caps expanded; Super Admin read-first unlock preserved.
- [x] Shared advertiser evidence rejects generic names; original office branding replaces importing-workspace fallbacks, including established Anglo Saxon affiliation.
- [x] Vertical wheel, touch and mouse gallery gestures scroll the surrounding results; expanded menu sits at the top-left title edge.
- [x] Visible publication column title and boundary-contained sticky contact bar verified through the end of the expanded card.
- [x] 26 focused assertions passed across two runs; authenticated mobile/desktop verified four default sliders, loaded Tal Zano office logo/name/source license, gallery wheel/touch/mouse scrolling and footer boundary. Build OK; no real property values changed. Fresh Yad2 import and real pricing save not performed.

## Publication controls and permanent inventory protection November 10
- [x] Accurate public/broker-only confirmation, pause action, opposite footer actions and lead help; server feed restricts zero-lead offers to authorized brokers.
- [x] Closing-first sliders, three lead icons, interaction-only encouragement and per-tier daily caps.
- [x] Account-wide rolling-day paid-lead count and spend guard implemented; authenticated limit save/readback checked and test limits removed.
- [x] Exact-source duplicate prevention and terminal inventory protection; repaired search-URL overmatching and restored affected publication flags, retaining historical records.
- [x] 43 focused tests passed; authenticated desktop/mobile dialogs and help checked without page errors; build OK. Pause refresh deadlock covered by regression test.
- [ ] Transactional charging/tombstone SQL tests require privileged function execution unavailable to the sandbox connection; fresh import and publication cycle not verified end-to-end.

## Property presentation November 10
- [x] Restyle shared publication globes and remove visible publication heading while retaining reorder controls.
- [x] Place multi-select immediately before search without an adjacent selection checkbox.
- [x] Space edit actions and display original advertiser office/logo and broker/license using the existing authorized projection.
- [x] Signed-in desktop/mobile verified editing actions, loaded office logo, number-only license, adjacent selection/search, no toolbar checkbox and green/gray table globes; nine existing publishing/presentation tests passed and build OK. No property values or publication flags changed.

## Admin-led broker onboarding November 10
- [x] Admin broker setup requires explicit license approval, records service-owned silence, and never sends credentials; SMS/WhatsApp dispatch guards suppress recipient delivery before first authenticated entry (requested SMS OTP excepted).
- [x] Broker-specific public OTP invitation preview/copy available after creation and beside brokers in the users table; no login tokens/passwords in invitations.
- [x] First authenticated entry atomically selects own workspace and opens My Properties; later entries go home. Added selected-property closing-only batch editor using existing sale/rent dialog without overwriting other lead amounts.
- [x] 27 focused tests passed, build OK; real temporary broker created silently, authenticated via password without SMS, first entry reached /properties and subsequent entry /; temporary account deleted. Admin copy and authorized batch dialog checked. No real SMS OTP, fresh Yad2 scrape or batch price save performed.

## Open marketing properties November 9
- [x] Instant marketing appears only for actively selected visible properties; existing public-safe feed and authorized share actions retained.
- [x] Sharing Pool reuses home board cards/table, search and role-aware advanced filters; view/search controls opposite multi-select.
- [x] Authenticated internal navigation verified selection/deselection, no-match search, advanced panel and both views at desktop/mobile; 18 focused tests passed and build OK. Direct reload resets Partner Mode via existing workspace behavior; no permission bypass or change made.

## Automation pacing audit November 9
- [x] Inspected browser actions, messaging queues, claims/leases, retries and safety gates; read live schedules, post caps and aggregate activity. No production sends.
- [x] Prepared source-cited report with prioritized recommendations, live-vs-static evidence and runtime limitations. No automation changed; 15 existing group policy/discovery tests passed.
- [x] Included quick scan results (12 warnings/11 informational) and explicitly excluded the pending deep scan from conclusions; its notification will arrive separately.

## Manual broker approval November 9
- [x] Profile/admin distinguish registry מאומת from user+license-bound manual מאושר; historical approvals do not keep a removed license active.
- [x] Shared entitlement grants manual approvals closing/property access; broker registration accepts manual evidence without registry lookup. Removal deletes broker roles before clearing license and revokes manual/affiliate evidence; transfer trigger rejects borrowing approval.
- [x] 29 tests passed, build OK; authenticated mobile/desktop חגי אורן shows מאושר · מתווך פעיל, closing entitlement true and My Properties accessible. Another account cannot use 30625911. No page errors.
- [ ] Removal rollback SQL test is retained but blocked by the provided connection's function permissions; no real license removed. Partner Mode as the broker himself and a completed removal remain unverified without an approved broker session/privileged test connection; consent and account isolation unchanged.

## Broker registry identity November 8
- [x] Canonicalize official names separately from raw certificate evidence; update matching saved profiles, registry responses/review names and two matching ad contact names, leaving arbitrary people/office names unchanged.
- [x] Return confirmed profile/activation state, stop redundant post-verification writes, stabilize input callbacks and end checking on failure; distinguish locked verified evidence from server-confirmed active entitlement.
- [x] 26 focused tests passed, build OK. Live 31927721 lookup returned דולי אידלסון/הרצליה; authenticated mobile/desktop selected-owner profile showed מאומת · מתווך פעיל without identity editors or duplicate upgrade card. Server ignored attempted name/city edits. Fresh SMS/certificate-to-role onboarding was not exercised; existing ownership protections remain required.

## Campaign entry and accessibility November 8
- [x] Make every campaign plus action open the full channel picker, clearing only navigation context.
- [x] Integrate a locally bundled MIT accessibility engine with a sidebar-only trigger and Hebrew keyboard-accessible preferences.
- [x] Nine focused tests passed; authenticated SMS subpage plus opened all six channels. Mobile/desktop verified all preferences, keyboard Space/Escape, 200% bound, reset and hidden sidebar-only trigger without page errors. Build OK. Accessibility Review identified missing baseline input focus indicators (fixed); full-site semantic/screen-reader audit and Israeli/WCAG certification remain unverified, not implied by the widget.

## Profile completion warning November 8
- [x] Validate the displayed profile owner's saved name, city and phone without account/workspace mixing; absent/error/stale reads never generate missing-field claims.
- [x] Consume scoped confirmed-save readback immediately, refresh on focus and visible 30-second checks, and automatically remove completed warnings.
- [x] 12 focused tests passed; authenticated mobile/desktop profile showed saved הרצליה without a missing-city warning, unchanged city saved with 200 and persisted after reload without warnings or page errors. Incomplete-to-complete transitions covered by regression tests, not by clearing real personal data; build OK.

## Broker profile and partner switching November 8
- [x] Auth-bound partner activation requires current terms, retains identity and uses account affiliate roles; provisioning skips existing profiles and unrelated updates do not retrigger license freshness validation.
- [x] Lock official name/city for all viewers with server enforcement and existing verification evidence; registry fetching is only in failed automatic-fetch Super Admin pending review. Verification functions deployed.
- [x] 32 focused tests passed; authenticated mobile/desktop selected-broker profile has no name/city editors or registry button, partner activation returned 200 and selected partner menus without broker property tools, and switching back succeeded. Server rejected selected verified-profile identity overrides; build OK. Fresh registry scraping and first-time consent were covered by tests, not exercised live.

## Step 8 feedback November 8
- [x] Restore closing partner estimate and icons only in the publisher; retain other editors and price bounds.
- [x] Add interaction-only live encouragement for the three publisher lead sliders.
- [x] Focused pricing tests passed; signed-in shared Step 8 editor verified all three interaction-only messages and closing maximum estimate 100 on mobile, with desktop capture. Cancelled all price changes; build OK.

## Unavailable listing details November 8
- [x] Confirm reported owner slug is absent from saved listings; preserve the server's publication and workspace access checks.
- [x] Use immutable saved IDs for homepage expansion and show an explicit unavailable/retry state instead of empty expanded content.
- [x] 24 focused tests passed; authenticated mobile expansion loaded real details using UUIDs, absent reported slug displayed the unavailable page with no page errors, and build OK. No missing listing was fabricated or authorization changed.

## Import commission modes and expansion November 8
- [x] Remove Step 8 partner-count scaling and replace it with concise popularity text, preserving slider bounds.
- [x] Anchor expanded My Properties titles below stationary headers within the existing scroller; managed summary rows now identify their expansion anchor.
- [x] Split batch import commissions by actual sale/rent inventory, apply requested bounds/defaults and require legal acceptance before fee writes; preserve drafts on cancel and surface partial save failures.
- [x] 41 focused tests passed. Signed-in mobile/desktop expansion title sits 8px below the heading without document movement; import modal acceptance and real 0.21% fee readback verified with original values restored. Discovery/extraction were simulated using an existing authorized listing, not a fresh Yad2 scrape; batch/rental mode rules covered by tests. Build OK.

## Price controls and saving November 8
- [x] Add a visible semantic border to slider thumbs and place closing pricing before all other lead settings.
- [x] Reproduced HTTP 406 from the wrong workspace predicate; reward saves now resolve the authorized listing's saved workspace without weakening RLS.
- [x] 29 focused tests passed; authenticated mobile save returned 200, changed price persisted after reload, original price restored, and mobile/desktop slider borders and closing-first layout checked.

## Super Admin registry name lookup November 8
- [x] Add registry action beside broker license fields in selected-workspace Profile and Super Admin user editing, with wrapping mobile controls.
- [x] Deploy Super Admin-only official-registry lookup with exact stored-license checks, locked-identity protection, current registry evidence and persisted profile-name readback; no license approval or role changes.
- [x] Live admin button fetched license 31927721 as אידלסון דולי; UI and database persisted it after refresh. Invalid auth returned 401, invalid input 400; 15 tests passed including not-found and scope-switch cases. Desktop and 442×728 dialogs/profile inspected; build OK.

## Advanced search and shekel rewards November 8
- [x] Fix homepage dropdown and slider matching against whitelisted property facts and authorized reward data in the same paginated board feed; remove split deal state and skip no later pages after an empty eligible page.
- [x] Derive closing search bounds from current full-board net ILS values, independent of selected filters; no fabricated bounds when data is unavailable.
- [x] Display commission/reward badges in absolute shekels without changing stored agreements or visibility permissions; strip financial values from persisted board caches.
- [x] 104 focused tests passed; live signed-in property-type selection returned 7 matches, closing bounds 128–90400 and maximum threshold returned 1 match, form threshold returned 1 match with ₪120 net. Desktop/mobile inspected without page errors or horizontal mobile overflow.

## Imported inventory publication November 7
- [x] Fix workspace-role visibility and scoped publication with persisted readback and Hebrew failures; discard late workspace responses.
- [x] Verified existing listings RLS/grants permit active-workspace updates; no schema change or weakening of required pricing/license checks. No Facebook or credit dependencies.
- [x] Authenticated Super Admin in חגי אורן's workspace published imported property 01b77dc3-d7e6-459e-88ac-a45f0ed8f048 through the UI; public flags read back with 200 and persisted in the database. Broker-self access covered by regression test.

## Home controls bar November 3
- [x] Move search, sort and view-mode toggle below the site title and above the table on the signed-in home page; search far right, view toggle far left, sort beside it; no property count.
- [x] Share one sort menu with "הנכסים שלי" (src/lib/listingSortOptions.ts + src/components/ui/sort-dropdown.tsx); removed the duplicate header search/view controls.
- [x] 5 focused tests passed; signed-in desktop verified positions, the six identical options, ascending price re-order and no count. Build OK; the 9 failing suite tests are unrelated (phoneSession, signupRole, wallet, ai-brain, group chips).
- [x] Controls row now sits above the search panel and stays put when it opens (measured 0px move at 1280px and 393px); removed the magnifier inside the search field and the 12px space above it.


## Yad2 import cards November 1
- [x] Split the import slide into two framed cards: "יבוא כל המודעות שלי מיד 2" (exact office-page sentence, lighter placeholder, tip under the input) and "יבוא מודעה מיד 2" (statement under the title), office-page card first.
- [x] Import buttons appear only for a matching link (office page vs single ad), "המשך ללא ייבוא" is a framed outline button, the role heading reads "מי מפרסם?" and the top tabs have no arrows.
- [x] 8 focused tests passed (src/test/yad2ImportLinks.test.ts, src/test/yad2Publisher.test.ts); signed-in broker flow verified: no import request fired while typing, buttons appeared only for valid links, no runtime errors. No listing imported or published.

## Mandatory publisher entry November 1

- [x] Reset every explicit free-ad opening to publisher choice before sale/rent, including developer accounts; preserve scoped content and pricing-only recovery.
- [x] Keep broker verification and import authorization, and require ownership by selected private branch rather than account role.
- [x] 31 focused tests passed; guest and signed-in mobile opening, sale/rent back, cached reopening and private/developer declaration branches verified without runtime errors. Build OK; no listing published or license changed.

## Publisher cards and optional consent October 30
- [x] Move view toggle, anchor expanded steps, unify closing offer/percentage and rename Rita cards.
- [x] Reorder declarations and preserve optional marketing decision and authentication; 46 focused tests passed. Signed-in mobile verified 1% sale, 0.2–2% bounds, collapsed/expanded percentage and decline-to-confirmation with consent unchecked and no runtime errors. No listing published.

## Step 8 closing and consent refinement October 30
- [x] Closing first, required/zero styling, undefined sale 1% and rent 50%, matching percentage summaries.
- [x] Combined legal approval and final declaration wording; four Navy Blue legal links have no underlines. 42 focused tests passed; signed-in mobile rent 12000 → 6000 (50%), expanded/collapsed summary and approval checked. Build OK, no runtime errors; no listing published.

## Direct non-broker publication October 30
- [x] Skip publisher-type selections for partner/private publication and add mandatory owner declaration without changing broker/developer flows.
- [x] 27 focused tests passed; signed-in mobile direct entry skips both publisher selections. Declaration starts unchecked, checked state survives reload and can be unchecked. Build OK and no runtime errors; no listing published.

## Step 8 pricing refinement October 30
- [x] Empty focused price, five-digit reward visibility, exact lead titles, nonzero closing bounds and editable percentage/default.
- [x] Native board scrollbar and full-width collapsed rental/reward summary.
- [x] 25 focused tests passed; signed-in empty/9999/2000000 price visibility, 0.2–2% bounds, 1% default and 1.5% manual readback verified. Mobile/desktop collapsed rental summary checked with four rewards; build OK. No listing published.

## Logo and activity layering October 30
- [x] Logo label inside top-right of upload square. Body-level activity layer stays above page tabs with 5px backdrop blur; signed-in logo, topmost hit test, live properties, earnings tab and close cleanup verified. Nine focused tests passed; build OK and no runtime errors.

## Rita active-owner isolation October 30
- [x] Bind greeting and assistant name/role/gender to the authorized owner; caller authorization remains separate. Scoped history excludes unknown legacy transcripts; ai-agent deployed.
- [x] Remount all Rita surfaces on handoff and reject late events/responses; signed-in Shafi greeting, partner suggestions and live reply confirmed her exact name and affiliate role, without runtime errors. Real workspace switching was not exercised; regression tests cover handoffs.

## Office details and sticky tabs October 30
- [x] Fixed-height opaque sticky profile tabs, verified at 411px and 1280px.
- [x] Exclusive nationwide city selection; square-logo-only layout with inline name save and automatic logo/service-area saves; no outer card or global office save.
- [x] Eleven focused tests passed; signed-in nationwide save persisted alone after reload without saving a display-name draft. Original Ashdod selection restored and verified; no runtime errors. Logo upload was not exercised against real branding.

## Inline profile saving October 30
- [x] Save only the confirmed profile field; pencil becomes check while editing, no global save; metadata/cache merge only saved field values.
- [x] Exit and labeled account deletion below upgrade in normal flow with separator. Ten tests passed; signed-in mobile city confirmation restored pencil and survived reload; action position static and deletion opened confirmation without sending code. Build OK.

## Workspace publisher isolation and explicit upgrade October 30
- [x] Bind publisher identity to active owner, remount wizard state on scope change, block stale workspace refreshes and hide unvalidated cached context; profile hydration cancels stale reads.
- [x] Remove automatic broker prompts and contact-step license fields from standard publication; no broker choice for unverified workspace owners.
- [x] Add explicit “יש לי רישיון” upgrade entry; preserve SMS/certificate and identity authorization, with no submission on another owner's behalf.
- [x] 17 focused tests passed; signed-in 411px standard publication shows no broker option/modal/license input. Profile upgrade shows the new option; current session views another owner's profile, so submission remains correctly blocked. Build OK.
- [ ] Genuine self-account license verification requires an authorized account, received SMS and certificate; real multi-workspace contact readback requires a session with selectable workspace access. No role, phone or identity changed during checks.

## Publisher fees and verification October 30
- [x] ILS-first closing/sale fee values and limits; center ad type and restrict inventory import choices.
- [x] Remove colored field/dropdown focus borders globally while keeping neutral keyboard focus.
- [x] Require SMS and official broker verification before broker publication; protect verified identity server-side with pre-registry name and certificate checks preserved.
- [x] 33 focused tests passed; signed-in mobile/desktop broker selection opens required SMS gate, no My Properties for the current non-broker role; neutral focused field verified. No codes sent, property published or real identity changed.
- [ ] Genuine new broker OTP/certificate approval and successful publication readback require a recipient-controlled phone/code, authorized certificate and consent to publish. Positive verified-broker import UI remains unverified with the current non-broker role.

## Property-based service messages October 30
- [x] Remove fabricated SMS sample content; add searchable property selection below recipients for SMS, WhatsApp and email, and relocate IVR's existing selector there.
- [x] Reuse workspace-authorized/partner-safe inventory and selected-property generation; preserve Facebook/Instagram flows and approved WhatsApp templates.
- [x] Fifteen tests passed for template access, partner inventory, property variable binding, clearing and stale-response isolation; build OK. Signed-in mobile SMS selected a live property and generated content read back in the editor; WhatsApp and IVR menus are below recipients. No messages sent. Email interaction remains unavailable until a sender is configured; WhatsApp customization applies only to supported approved variables, not fixed template text.

## Service recipient presentation October 30
- [x] Match recipient placement and typography across SMS, WhatsApp, email and IVR; service-specific bold placeholders, bold selections and inline WhatsApp template placeholder.
- [x] SMS, IVR and WhatsApp signed-in mobile selection/readback verified: identical 17px/700 text, 362px width and top position; WhatsApp template typography matches. Twelve regression tests passed, build OK; no campaigns sent. Email retains its sender prerequisite; recipient interaction remains unverified because this workspace has no configured sender.

## WhatsApp templates October 30
- [x] Restrict broker invitation template listing and sending to Rita's workspace; restrictive cache RLS and deployed send checks.
- [x] Hide resolved variables and duplicate free-text editor; align counters and personalization toolbar.
- [x] Five focused tests passed, non-Rita live send request rejected with 403 before delivery, signed-in mobile WhatsApp shows one approved message with inset counter and no invitation or variable input; build OK, no runtime errors. No messages sent. Email toolbar visual check not completed because channel state stayed WhatsApp.

## Partner campaign picker October 30
- [x] Use the shared public-safe available partner inventory instead of workspace-owned properties in partner context; preserve listing IDs and exclude closing-only offers for unverified partners.
- [x] Ten focused tests passed including pagination and privacy. Signed-in partner workspace fetched five shared rows, showed four audience-eligible choices plus clear selection, and selected address/price/photos read back; build OK, no runtime errors. No campaign published.

## Facebook chooser disconnection October 30
- [x] Add workspace profile disconnection/account switching and independent Page disconnection; remove group shortcuts.
- [x] Show profile connection first when disconnected; 17 focused tests passed and signed-in 442px preview checked. Fixture-backed Page removal, profile disconnect and reconnect dialog verified without changing real connections; build OK and no runtime errors.
- [ ] Real new-account login and Page authorization readback await a user-controlled Facebook login and usable cloud runner/Page grant; no real connection was disconnected during verification.

## Personal profile and tasks October 30
- [x] Outline default avatar, matching full-name field and fixed profile tabs with 10px less top spacing.
- [x] Show unverified workspace profile upgrade without submitting another person's verification.
- [x] Personal task creation, editing, completion, schedules and empty-state add controls without tours; rename page מטלות.
- [x] Ten focused tests passed; signed-in 442px profile upgrade/pinned tabs and task create/edit/complete/reload/delete verified; build OK, no runtime errors. External reminder delivery not verified.

## Publisher-style filters October 30
- [x] Share publisher room, floor, amenity, condition and entry menus; preserve reward sections and role visibility.
- [x] Match selected options against saved listing facts; 20 focused tests and signed-in menu selection/readback passed.

## Shared property filters October 29
- [x] Reuse public filters in Properties, align below search over the hidden options row, enable scrolling and preserve page position.
- [x] Placeholder-only fields, opposite icon-only close, exclusive nationwide selection, extra 5px below blue section.
- [x] Seven tests passed; live signed-in phone layout has matching 368px widths, internal scrolling, working price filter/reset/close and unchanged page position; no runtime errors, build OK.

## Partner navigation and properties spacing October 29
- [x] Plain property count with נכסים and fixed 15px toolbar spacing; measured phone layout.
- [x] Strict partner/private navigation and route presentation; personal tasks and existing partner transaction RPC view, with separately scoped private transactions.
- [x] Focused tests and signed-in broker inventory checked; simulated partner navigation/redirects/tasks/transactions checked without runtime errors. No real partner/private account session was available for positive-data verification.

## Account personalization and activity October 29
- [x] Correct personal Rita identity without changing authorized workspace data context.
- [x] Hide broker-only partner/private navigation and simplify their dashboard/activity; preserve broker My Properties and reuse public-safe sharing inventory.
- [x] Close Facebook Page menu on every action and resolve settings/groups loading stalls; use the same selector in connected profile settings without a duplicate Page display.
- [x] Focused rule tests and signed-in mobile activity/groups checks passed; no runtime errors. Real Page linking/removal remains untested because the current workspace has no saved Page grant (see Facebook connection blocker below).

## Facebook Page connection October 29
- [x] Route Facebook connect/add-Page buttons into one in-app cloud connection window; remove unrelated settings and direct OAuth redirects.
- [x] Reuse server list_pages/select_page authorization and retain existing bindings; no login when authorized Pages are available.
- [x] Reuse the cloud browser tab and active session without group import for Page linking. Twelve focused tests passed; live signed-in window opened, simulated mobile additional-Page selection retained both Pages without OAuth; no runtime errors, build OK.
- [ ] Complete real additional-Page linking/cloud-only new Page authorization: current workspace has no usable saved Page grant, and the cloud runner has no official Page authorization/token exchange capability. Cloud login alone cannot grant Page publishing permission; no real Page was linked.

## Property page access October 29
- [x] Restrict technical Bright Data warnings to the signed-in Super Admin, independent of workspace.
- [x] Share account-scoped verified-broker/developer checks across navigation and direct routes; retain My Ads with separately owner-authorized editing.
- [x] 30 focused tests passed; live verified-broker inventory and My Ads loaded, non-developer project access redirected, simulated owner-role route/navigation denial checked; no runtime errors, build OK. No real developer or Super Admin session was available for their positive-path checks.

## Publisher card corrections October 29
- [x] Remove switches; center expanded prices only above sliders; halve icons and move help to top-left.
- [x] Exact gray zero-offer text; discrete zero then min-to-max scale verified across all four sliders; 29 tests passed.

## Publisher threshold sliders October 29
- [x] Apply zero-or-minimum thresholds to four sliders; live first movement and back-to-zero transitions verified, plus sale/rental threshold tests.
- [x] Match collapsed offers and keep thin, gray-at-zero icons in both states; mobile/desktop views and all four zero-icon colors/strokes verified.

## Publisher pricing card alignment October 29
- [x] Unify closing and lead card headers, icon strokes and edges; place titles/help below prices.
- [x] Verify expanded/collapsed controls and zero defaults: 14 focused tests passed; mobile/desktop cards and closing edit to 1% checked without publication.

## Platform-wide document October 29
- [x] Two-column intermediate grids, shared-row photo alignment and existing bounded footer; 320/446/768/1280px checked.
- [x] Explicit closing-only audience predicate reused on board, account ads/activity and favorites; preserves guest browsing and unknown/redacted rewards. Signed-in board shows 7 versus 8 guest cards.
- [x] Single-row silver contact actions, no Rita photo, red/green/blue controls and bottom-sheet forms; no text overflow at checked widths. Guest card/table sharing opens the same property-share dialog.
- [x] Audited existing server Page selection, bounded cancellable scans, social publishing/direct-window actions, unsortable תגמולים, certificate document matching, legal notices and rotating final footer; preserved. Restored exact auth logo spacing.
- [x] 54 focused tests passed; live guest/signed-in lists, mobile sheets, share dialog and aligned photos verified; build OK. Inquiry requests tested with mocked gate only, no real lead/callback created.
- [x] Certificate-based identity upgrade and universal OTP code excluded: neither safely proves account ownership.
- [ ] External checks remain blocked: genuine certificate/new-account completion, renewed Facebook authorization, successful scan-worker results and explicitly approved real post readback (see existing sections below).

## Broker certificate verification October 29
- [x] Add certificate upload, OCR and exact registry matching as a document-only check; no certificate-based role or verified-status upgrade. Deployed; 21 focused tests pass, authenticated non-certificate rejection verified through the live endpoint and upload control; build OK.
- [ ] Verify a successful match with a genuine broker certificate and the full new-account signup screen; requires an authorized certificate and new-account session. Existing-account isolated upload control was tested without changing roles.

## Signup and profile controls October 26
- [x] Two deal buttons, gender-aware details title, aligned city/property menus and visible last Other option.
- [x] Larger profile text, full-circle avatar with outside camera/trash, live completion notice and fixed office save.
- [x] Multi-select service areas with nationwide first; bold menu and publish text +2px with unchanged frame.
- [x] 24 focused tests; signed-in 446px profile, 94px avatar, 97x40 publish frame, visible Other and office save verified. Service areas saved/read back and original empty selection restored. New signup completion and uploaded-avatar deletion were not repeated.

## Signup celebration and reward polish
- [x] Four lead icons and explicit-zero labels without restricted-price leaks; sidebar fonts -3px, publish text +3px, empty bell hidden, glyph sizes changed without frame changes.
- [x] Immediate type-specific welcome, seven-second full-height falling confetti and generated ElevenLabs sounds; server-configurable atomic signup bonus (initial default 500 credits) read from the actual grant. Legacy intros no longer cover the welcome.
- [x] Account-only confirmed lead/referral/closing earning sound, cached once and enabled after user interaction; no playback for historical grants, adjustments or topups.
- [x] Focused tests and real fictitious-phone signup verified: 500-credit welcome, seven-second cleanup, close/reload without repeat welcome; header frame 36px and chart glyph 23px, publish frame 97x40 with 16px text; build OK. No real commission generated during testing; injected account has no Super Admin access to settings.

## Signup details and gender October 26
- [x] Match signup language to chosen gender; extra logo space, back controls, smaller footer and matching headings.
- [x] Separate type picker from details; city and property menus, owner sale/rent, developer import link, license placeholder without signup disclosures; owner deal persists through constrained RPC.
- [x] Fix unbound RPC causing undefined rest error; 37 tests pass, phone UI navigation and live authenticated rejection/friendly error verified without changing the real user's identity; build OK.
- [x] Successful fictitious-phone account completion and actual bonus readback verified in the signup celebration task; no existing real-user identity changed.

## Profile gender and personalized language
- [x] Rename gender selectors globally to גבר/אישה; keep canonical male/female in existing constrained profiles.gender, remove metadata/cache fallback.
- [x] Add auth-user-keyed language context, shared authored-control localization and profile preference controls including when viewing another workspace; read back saved rows before context update.
- [x] Share explicit male/female/neutral helper for controls, selected toasts, notifications and email; SMS/WA system slots query actual recipient profile, fixed approved WhatsApp text untouched. Existing neutral text and user/property content stay unchanged; arbitrary legacy sentences are not machine-rewritten.
- [x] Verified real female save, immediate command change, reload persistence, male switch and original preference restoration; focused tests cover recipient resolution/account isolation. External message delivery not exercised; no message sent.

## Platform alignment October 26
- [x] Auth spacing, bold larger fields, ten-digit formatted mobile and reversed OTP boxes; keep real server OTP verification, no universal bypass.
- [x] Guest table share reuses image-card dialog; social publication opens matching tailored dialog; public landing opens synchronously without prompts; edge-align table settings.
- [x] Standardize visible rewards to תגמולים and block reward sorting in public/shared tables while retaining reorder.
- [x] Contain global footer and enlarge legal links; selected Page requests explicitly scope to authorized workspace and surface discovery errors.
- [x] Verified guest/signed-in publication dialogs, matching guest share, direct landing tab and 320/411px plus desktop footer; 23 focused tests pass and preview build OK.
- [ ] Real Facebook Page selection and successful group results await renewed Graph authorization and external scan-worker results.

## Facebook Page selection and bounded group scanning
- [x] Reuse server Graph managed-Page discovery and authorized selection under campaign header; OAuth return opens existing Page picker, name/photo refresh on return.
- [x] Bound full group scan including hung initial/status requests to 60 seconds; cancel on discovery close/workspace change, preserve structured server failures.
- [x] Center group headings with official Facebook brand icon and clean manual-link placeholders; 18 focused tests and build OK.
- [x] Signed-in real group scan stops at 60 seconds, displays timeout reason and re-enables search; centered header/placeholder verified. No post published.
- [ ] Live Graph selection awaits renewed Page authorization (server reports no saved user token). Successful scanning awaits the external worker returning results; current jobs remain processing without callback despite active session.

## Final post footer and composer alignment
- [x] Verified existing +3px modal scale (21px heading, opposite-side actions) and two-credit confirmation regression tests without adding another increase or making a new charge.
- [x] Gallery tile and thumbnail image edges match exactly at 411px; clockwise 45-degree handles verified. Telephone emoji cleanup covers generation, polish, variations and final publishing.
- [x] Added service-only durable retry-keyed 10-sentence final footer for Graph Facebook/Instagram, cloud/claimed group posts and YouTube; deployed seven functions. Nineteen tests pass; client allocation/read denied; rotation 0–9–0 verified. No post published.
- [ ] External final-post readback awaits an explicitly approved real publication and a usable target connection; no Facebook or YouTube post sent during verification.

## Dialog readability and extra draft approval
- [x] Increase shared modal/pop-up typography by 3px and place Cancel/Submit on one row at opposite ends; mobile confirmation verified at 411x802 with 21px heading, 17px body/buttons and opposite aligned actions.
- [x] Fix confirmed two-credit draft renewal independently of publication pricing; preserve successful-only idempotent settlement and request ID. Six tests passed; signed-in approval generated a new draft (200), advanced batch 3 to 4 and recorded exactly 2 credits once. Build OK; no post published.

## Bright Data audit and optimization
- [x] Add Super Admin report with feature/API/cache breakdowns, recorded app credits, provider costs kept distinct, daily activity and export; signed-in report verified.
- [x] Instrument REST/browser calls; shared atomic non-sliding caches for developer/sections/status reads, deduplicated bounded developer batches; preserve daily item claims and scheduled slots and report failed scheduled responses truthfully.
- [x] Add non-disruptive alerts and optional foreground live refresh; 14 tests passed, schema denies anonymous reports and client cache claims; build OK.
- [ ] Exact historical provider costs and observed savings await available Bright Data billing detail and comparable post-deployment traffic; report currently marks costs unavailable.
- [ ] Live CPU/memory utilization history awaits a backend resource-metrics interface; current health snapshot does not supply continuous utilization.

## Post composer controls
- [x] Increase input fonts by 2px, retain bottom-left manual textarea resizing and remove content counter.
- [x] Add touch-pointer thumbnail handles with keyboard fallback; show saved effective Facebook Page below setup heading without legacy token gating.
- [x] Ten focused tests pass; signed-in mobile image 1-to-3 and restore, auto-expansion, desktop manual resize and screenshots verified; build OK, no publication.
- [ ] Live Page name/photo check waits for a saved Page binding in the active workspace; none returned during verification.

## SMS-only registration and intro
- [x] Update final intro signup/swipe exit and outlined header login action.
- [x] Replace auth UI with validated split names, gender and mobile; SMS OTP only, no master-code path.
- [x] Persist profile details through verified-phone RPC and collect five post-OTP user types with essential fields, preserving license and consent checks.
- [x] 36 focused tests pass; mobile/desktop registration and login, final intro CTA, 50px logo and server rejection checks verified; build OK.
- [ ] Real SMS delivery and new-account OTP-to-role completion require a recipient-controlled phone and received code; no SMS sent or test account created.

## Platform publishing and privacy updates
- [x] Add shared server-record identity redaction to generation and Graph/cloud publication; shared landing reuses canonical original advertiser projection; generated short links use toraff.co.il.
- [x] Add cyclic image navigation and confirmed deletion in campaign, listing wizard, projects and media library.
- [x] Add stored Business Page photo/name and named crossposting choice; one-click cloud group import offers keyword discovery when empty.
- [x] Split social draft price into 2 credits / per post and enlarge toolbar icons 30% with 6px bottom gap.
- [x] 45 focused tests passed; signed-in mobile composer and image next/cancel checked; build OK; no post published.
- [ ] Business Page-only cloud acting identity and full live import: requires server-confirmed Page acting identity from the cloud runner, absent in current session contract; existing GoLogin launch access remains blocked. Page badge unverified live because current workspace has no Page binding.
- [ ] Private-owner social identity exception: remain anonymous until the server can verify the actual publishing user owns the private listing and the target groups; no client identity bypass added.

## Cloud campaign publishing validation
- [x] Cloud group publication uses server-confirmed sessions and the background cloud runner without Page tokens; confirmation shows GoLogin connection, and Graph credentials stay required for Page/Instagram.
- [x] 22 tests pass; signed-in confirmation displays active GoLogin with zero Page targets. Validation correctly requires selected groups; no post sent. Actual dispatch cannot be tested in this workspace because it has no available groups.

## Secure Facebook cloud guidance
- [x] Add mobile-friendly guidance before cloud login, safe new-tab fallback and server-confirmed status checks.
- [x] Reject client credential/cookie uploads; deployed endpoint rejects synthetic password input; disclose encrypted session storage accurately.
- [x] All 17 privacy/connection tests pass; signed-in guidance and provider-error state reviewed at 411x802 and desktop; build OK.
- [ ] Complete actual Facebook login/group import: GoLogin still refuses Cloud Browser launch for the configured account (403); no Facebook password entered or requested by TORAFF.

## Super Admin user deletion
- [x] Permanently deleted Barak Israely: 327 active records purged; verified zero login/profile/roles/files/listings/workspace memberships.
- [x] Added shared confirmed multi-select deletion to API-settings and Super Admin users. Seven tests pass; signed-in two-account selection/confirmation canceled safely, Barak absent in search; build OK.

## Selected-property actions
- [x] Preserve the clicked property's identity through Facebook connect-later, draft restoration and generation of the post/first comment; late connection checks cannot undo skip.
- [x] Check shared action target paths; 22 regression tests pass and signed-in generation verified on two public properties with matching selector, photos, post and first comment. No post published.

## Profile action bar visibility
- [x] Keep the sign-out / save-profile row pinned at the bottom of the profile screen on phone-sized viewports, resting above the legal footer; other tabs keep their normal bottom gap. Browser-verified at 446x728 and 1280x900, build OK.


## Auth and property consent forms
- [x] Keep auth submission visible and disabled until valid; silently validate names on client and server. 37 focused tests passed and authenticated server validation checked.
- [x] Align publisher header corners, bold expanded titles and move marketing consent above square legal checkboxes.
- [x] Verified signed-in draft opt-out opens explanation, continues to explicit confirmation and keeps consent off; no property published during verification.

## Workspace card identity
- [x] Show the owner's full name as the workspace title for individuals (office/company names kept for branded workspaces) with the mobile below, in the sidebar card, workspace list and login picker.
- [x] Server-owned is_office/owner_phone flags in get_my_workspaces (phone only for the owner or Super Admin); 6 identity tests pass, signed-in drawer verified, build OK.



## Selected-workspace closing display
- [x] Allow Super Admin display to follow the authorized selected owner's official broker eligibility, without changing payout eligibility.
- [x] Refresh entitlement and authenticated redacted property data on workspace switches; 42 focused tests pass. Signed-in Super Admin switched through UI to Udi's workspace (server true, closing prices visible) and back to unlicensed workspace (server false, all broker-only labels restored); build OK.

## Licensed-only closing display
- [x] Replaced role-only/Super Admin/test-license closing entitlement with current official registry evidence and server-verified licensing; shared displays fail closed.
- [x] Gray closing icon and broker-only popup reuse saved course/exam links; 39 focused tests pass, guest and signed-in board popup checked, signed-in server denial confirmed and current build OK.

## Pricing editor corrections
- [x] Fix zero form-fee saves and Super Admin cross-workspace pricing edits without widening other permissions; reload authorized data before reopening.
- [x] Align pencil/red dot opposite close; remove read-only footer; collapse questions and show configured form fields.
- [x] 54 focused tests pass; signed-in Super Admin disabled form fee, saved/reopened and verified zero, then restored original 100. Mobile screenshots and current build checked.

## Consistent zero-fee lead indicators
- [x] Show four ordered types for guests, Super Admins and brokers across shared indicators and pricing details.
- [x] Mark known zero fees gray without exposing restricted amounts; 32 focused tests pass, guest and signed-in table indicators and guest pricing dialog verified.

## Weekly notification quiet hours
- [x] Remove selected notice and add global/day-specific quiet-time controls.
- [x] Persist and enforce weekly schedule; test overnight intervals and saved settings.

## Property card presentation
- [x] Show authorized commissions inside the original publisher section in grid and full details.
- [x] Keep favorite/share controls above images and make close controls icon-only.
- [x] Enlarge mobile contact labels and keep form/WhatsApp in one row; verify live views.

## Current request
- [x] Rewrite legal pages and add commission mechanism with shared logo and footer link.
- [x] Remove property landing headers and preserve configured contact/share actions.
- [x] Align service price with service title.
- [x] Implement workspace-authorized Facebook/Instagram draft billing: successful batches, explicit renewal confirmation and idempotent usage ledger.
- [x] Adapt Instagram connection presentation and verify documented provider capabilities.
- [x] Run focused tests and browser verification of legal pages and live draft billing, including cancel and approval.
- [ ] Full Instagram direct login, two-way DMs and comment automation: blocked on configured Instagram product, permissions and Meta access approval for customer accounts; existing Page connection alone does not grant these capabilities.

1. [x] Facebook first and Instagram adjacent already implemented in both channel lists.
2. [x] Campaign Facebook entry uses connection-only flow and link-style skip; security guidance remains inside its dialog, property widget preserved.
3. [x] Dedicated WhatsApp already has connection/skip flow; approved-template rules unchanged.
4. [x] Email sender gates recipients during loading and until a selected available alias/Gmail; immediate dispatch explicitly honors selection without silent fallback. Alias readback resets/discards stale responses on workspace changes.
5. [x] Dedicated email/SMS/WhatsApp remove attachment/record actions and duplicated channel preview, preserve placeholders, use “בחירה מהמערכת”, and portal the fixed send bar above legal footer with content clearance.
6. [x] Apply shared dedicated-channel presentation cleanup; legacy multichannel functionality retained.
7. [x] 44 focused tests and build pass; authenticated desktop/mobile Grow, email sender gate and mobile SMS bar checked without sending. Positive transport remains externally unverified.

## Icon-only reward indicators where no price shows
- [x] Compact indicators (table תמלוגים column, cards) show only the grayed icon for zero fees and restricted closing; ללא עמלה / למתווכים בלבד stay inside the pricing window.
- [x] 35 focused tests pass; guest and signed-in table cells and the guest pricing window verified in the browser; build OK.

## Card 8 and unified pricing window
- [x] Show immediate live pricing summary independent of consent; enlarge property prices and lead icons by 80%.
- [x] Route every reward icon to its master pricing window, with inline licensing links and grayscale broker label.
- [x] 34 focused tests passed; signed-in Card 8 showed ₪7,000, ₪40/50/80 and ₪700 closing immediately as complete without consent. Guest trophy opened one pricing window with inline course/exam links. Mobile screenshots and build OK; no listing published.

- [ ] Facebook cloud connect: service key saved; actual remote browser launch remains dependent on GoLogin account Cloud Browser access.
- [x] Consent-only broker invitation emails in batches of 25, with unsubscribe
- [x] Link-free official WhatsApp invitation wording (needs Meta approval)
- [x] Group import of Bright Data brokers with their listings as drafts

## Super Admin developer imports November 14
- [x] Mixed broker/developer links are validated and labeled separately; expected projects per developer persist locally and produce completeness warnings, never an import cap. The section is now "ייבוא מתווכים ויזמים".
- [x] Developer pages use resumable per-page checkpoints, exact canonical source URLs, own-project discovery and private project/unit saves. Real cached Yad2 HTML verified company bio/logo, three project IDs/cities/links and 82/128/110 total-unit counts; detailed unit merging is covered synthetically.
- [x] Silent active developer provisioning requires no broker license, phone, email or invitation and assigns only the developer role. Exact existing source links are reused; phone-only account matching is forbidden. New projects remain private and preserve manual edits, commissions and existing publication state.
- [x] Companies/projects/units save under the developer's own workspace for the existing "הפרויקטים שלי" queries, with separate developer/project/detailed-unit queue totals.
- [x] Twenty-six focused tests and backend checks passed; three functions deployed and authenticated desktop/mobile controls passed without overflow/runtime errors. One source page was fetched during endpoint verification; the accidental queue job was paused/removed and no account/project was created. Full multi-page live import and developer login readback remain unverified.

## Typewriter banner animation November 15
- [x] Slowed typing 15% (44ms to 52ms per character), kept deletion at 24ms, and added a one-second rest after a comma, period or exclamation mark before the rest of the sentence is written.
- [x] Eight focused tests passed; the live banner measured 52ms/char typing, 26ms/char deletion and 932-986ms rests after mid-sentence commas and periods.

## Signed-in Rita and Super Admin sidebar November 15
- [x] Remove the mini-chat greeting header and collapse control; add visitor-style divider dragging, centered expand and history-only clear.
- [x] Match composer font and newline/send shortcuts to the visitor chat while preserving workspace-scoped conversation state.
- [x] Move the Super Admin shortcut beside the top leads control, with a global red unread counter and no old bottom section.
- [x] Sixteen focused tests passed; signed-in mobile/desktop dragging, input, expand, clear confirmation and admin navigation verified without page errors.

## Dynamic TORAFF QR November 15
- [x] Add a singleton dynamic QR destination with public redirect resolution, atomic scan counting and Super Admin-only edits.
- [x] Add the public /go redirect and the Super Admin "ניהול QR דינמי" section with destination and usage statistics.
- [x] Generate a high-error-correction QR for only the canonical /go URL, with a centered square TORAFF logo and high-resolution PNG export.
- [x] Nine focused tests and TypeScript passed; live guest redirects, scan counting, secured admin saves, mobile layout and 1024px PNG download verified. The decoded PNG contains exactly https://toraff.co.il/go.

## WhatsApp discovery and broker cards
- [x] Recover stale jobs after 180s without worker progress, preserve a live bulk backlog, and renew fenced leases every 25s. Cloud claim/heartbeat/source/result returned 200 through the actual dedicated credential; four authorized jobs finished not_found without inventing contacts.
- [x] Add server-scoped paginated bulk discovery for imported brokers without WhatsApp, skipping existing contacts/demos/non-brokers/missing sources; the whole bulk scan was not launched.
- [x] Add manual/automatic number controls, separate WhatsApp saves, explicit confirmation of detected login-phone suggestions, and three-row broker cards with clickable blue/pink saved gender icons.
- [x] 30 focused UI/parser/worker tests and isolated recovery/lease/database checks passed; actual signed-in mobile/desktop cards and enqueue-to-terminal button reset verified. Railway variables documented in worker-whatsapp/README.md.
- [ ] Deploy the updated independent Railway WhatsApp worker permanently; deployment access is unavailable here. Temporary execution verified the new heartbeat/auth, not permanent Railway deployment.

## Registry lookup no-match runtime error
- [x] Return found:false/valid:false with HTTP 200 for an exact-registry no-match only; preserve authorization/provider/identity-conflict failures. Function deployed and 19 focused tests passed.
- [x] Real signed-in lookup for an existing saved unverified license returned HTTP 200/no profile; card identity stayed unchanged, shield became gray and remained clickable, error expired after five seconds, and no browser runtime errors occurred.

## Missing-license handling flow sweep
- [x] Read signup/profile/upgrade/affiliate/public-publisher/imported-login/admin UI, certificate endpoints, queued/legacy imports, Worker and current database verification/approval/setup guards. Explicit Super Admin approval remains separate and unchanged.
- [x] Completed certificate and manual-create registry misses return unsuccessful HTTP 200 validation results before writes; authorization, missing inputs and upstream failures stay distinct. Catch rejected OTP continuations, imported-review requests and registration calls without changing consent, privileges or records. Certificate and create-user functions deployed.
- [x] 56 targeted tests passed; authenticated admin no-match lookup verified HTTP 200, unchanged identity, retryable shield, five-second error expiry and no page errors. No live signup/certificate upload or account creation performed. Two pre-existing expectations (partner signup notification and manual-approval-only upgrade visibility) fail in broader tests and were left unchanged as unrelated to this failure.

## Broker WhatsApp and office-name layout follow-up
- [x] Inspect live jobs/recovery/schema, worker credential and polling, bulk enqueue and manual number/gender handlers; existing 180s recovery and bulk control are already implemented.
- [x] Move only the office name to the opposite edge of the identity row, keep office logo/details below, and increase displayed phone/WhatsApp numbers by 2px.
- [x] Verified signed-in mobile (411px) and desktop cards, office placement, 14px/16px numbers, manual/automatic controls, no horizontal overflow or runtime errors. 15 UI tests, 9 worker tests and isolated PostgreSQL recovery/lease tests passed. Dedicated machine claim returned HTTP 200 with an idle queue; no source fetch, message, contact change or bulk scan performed. Permanent Railway process remains unverified.

## Cold invitations and public simulation
- [x] Email modal has email only with compact card email/missing prompt; WhatsApp panel uses the server-owned saved WhatsApp contact without login-phone fallback. Invitation sends no longer change Auth phone, as explicitly confirmed by the user.
- [x] Role/gender-aware cold defaults, legacy warm-default replacement, public demo links and clickable previews are implemented; both invitation functions deployed. Per-recipient template submission is an explicit Meta-approval action, never a send; consent/duplicate/approval gates remain.
- [x] Guest menu enters six-role /demo simulation with local module views and Rita conversation; only anonymous public-board reads, no auth switching, private drafts or real writes.
- [x] Public and server-confirmed authenticated demo history share exactly five sanitized public-board-inspired posts with invented rewards, slowly changing simulated counters and at most three comments plus replies. Real campaign records/history are unchanged.
- [x] 53 focused tests passed across invitation, consent/target, links, simulation and privacy rules; signed-out mobile/desktop verified six roles, anonymous board HTTP 200/media, counter changes and local Rita reply. Signed-in email-only/cold preview returned HTTP 200, and authenticated broker demo history rendered five posts without runtime errors. No messages or Meta approval submissions sent; real invitation delivery remains unverified pending recipient consent/template approval.

## Demo uses the identical registered workspace
- [x] Deleted PublicDemo; public role basenames render the shared registered route tree, AppLayout, AppSidebar and actual pages. Removed the separate demo header; Super Admin entry opens the isolated public workspace without signing out.
- [x] Added PublicWorkspaceProvider, synthetic six-role workspaces, isolated QueryClient, local table mutations/Rita responses and fail-closed RPC/function/Auth/Storage/Realtime/fetch handling. LocalStorage preferences and caches are isolated and restored, with tests proving no real account state changes.
- [x] Added local properties/projects/units/leads/messages/community/tasks/deals/wallet/profile/connection fixtures and five posts through the normal campaign feed, not a custom history page. Unknown operations are unavailable rather than forwarded to production.
- [x] 33 tests passed; mobile/desktop workspace views, real sidebar navigation, in-page role switch to developer projects, marketing/owner/buyer/affiliate entry and community verified without runtime errors or production API requests. Existing-session browser restoration could not be completed because the injected session was empty; localStorage/Auth preservation is unit-tested. Not every nested modal/action was exercised; external sends/payments/publishing remain blocked.
- [x] Personal WhatsApp: 59₪/month card charge gate, pending provisioning request, Super Admin WhatsApp alert
- [x] Silent name-based gender fill (only when empty): signup prefill, Super Admin waiting/registry/shield lists

## November 25 remaining work and follow-up
- [x] Add tasks quick-create and signatures header actions; update demo drawer identity/auth strip.
- [x] Fix campaign media and provide five sanitized public-property snapshots with complete expanding details.
- [x] Align demo names/genders and distinct avatars; add campaign credit breakdowns and deposit history.
- [x] Verify requested demo flows on mobile/desktop; registered-account task page did not finish loading in the browser check.
- [x] Remove signature guide icon circles; center new-document button and increase text by 2px without resizing it.
- [x] Put waiting-card city beside office; show current red-shield count and persisted import progress in scanner toolbar.
- [x] Add verified-only gender classification with remaining count, live progress, persistent ambiguous-name skips and no saved-gender overwrite; authenticated run completed with remaining count zero.
- [x] Diagnose scanner disconnects and background load; consolidate onboarding/invitation lookups and reduce polling without changing sending safeguards.
- [x] Add eight public images to synthetic apartments/posts, simulated Rita chats and campaign progress, composer/footer clearance and broker-only Settings navigation.
- [x] Run 39 focused tests and isolated authorization/database checks; authenticated waiting cards and mobile demo chat/campaign controls verified with no runtime errors.
- [ ] Permanent Railway worker deployment remains blocked by unavailable deployment access; true WhatsApp logout requires manual QR reauthorization, and automatic resume has not been enabled.
- [ ] Nested demo property-detail final confirmation remains incomplete after correcting preserved query parameters; no real external sends, payments or end-to-end full-marketplace changes were exercised.
