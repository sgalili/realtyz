# External broker/developer import worker contract

Super Admin start actions enqueue in the existing `public.broker_import_jobs` table. New jobs have `status=running`, `stage=queued`, and `checkpoint.execution=external`; queued means pending pickup. Request type, target, canonical links, listing bounds and project caps remain in the job/checkpoint. Existing legacy jobs remain unchanged. The admin screen only reads progress every four seconds while visible; it never invokes scan steps.

## Machine endpoint

POST `/functions/v1/external-import-worker` on the project's Cloud function origin, with `Content-Type: application/json` and `x-import-worker-secret` set from `IMPORT_WORKER_SHARED_SECRET`. Configure the same secret in the external worker's environment using the secure form. Never use or request the Cloud service-role key externally. This endpoint does not accept user sessions as worker authorization.

Claim: `{"action":"claim","worker_id":"yad2-import-worker-1"}`. Returns `{ok:true,job:null}` when no job is due, otherwise the full leased job with a fresh `lease_token`. Claims are atomic and skip locked rows. Save that token privately; another worker may reclaim the job after 180 seconds without heartbeat. Process one job serially and check progress's `stop` value between external actions.

Progress/heartbeat body:

```json
{
  "action": "progress",
  "worker_id": "yad2-import-worker-1",
  "job_id": "<claimed job UUID>",
  "lease_token": "<claimed lease UUID>",
  "stage": "importing",
  "status": "running",
  "counts": {"brokers_done": 5, "listings_done": 27, "skipped": 2},
  "checkpoint": {"phase": "importing", "brokerIndex": 5, "listingIndex": 0},
  "release": false
}
```

Heartbeat every 30 seconds with empty counts/checkpoint and the current stage. Progress renews the lease; `release=true` clears it after a safe checkpoint or retry deadline. `status=completed/failed/paused` releases automatically. A manual pause cannot be overridden by an in-flight response: its last committed progress is accepted but `stop=true` is returned. A stale/expired/mismatched lease returns 409, which must stop that worker. Counts are absolute committed totals, must not decrease, and include only saves that already read back successfully.

Checkpoint updates preserve execution mode, request type, source and requested limits. Persist waitUntil in epoch milliseconds, waitReason and transientRetries; waits above three minutes and continuing after eight transient failures are rejected. A retry counter decrease requires a new `lastSuccessfulActionAt` checkpoint; manual admin resume remains the other allowed reset path. Do not retry schema/identity/authorization errors as Bright Data errors. On final failure report the actual bounded error and `status=failed`.

## Worker responsibilities and deployment boundary

The standalone Node 22 `worker/index.js` bundles canonical source parsers and uses four paced source-read channels by default. Saves/checkpoints remain serialized per leased job; successful sibling reads commit before a retry. Broker identities are saved before queued property enrichment. Developer actions accept `partial:true` to save the private developer/project/unit hierarchy after each identified page, retaining `externalPendingDeveloper` until final completion; final saves report the same inventory rather than duplicate it. Machine actions `known`, `broker`, `listing` and `developer` require the claimed job, worker ID and lease token. Known-entity checks precede paid enrichment when source/license is known; broker HTML is parsed again server-side and license creation uses official verification, never automatic approval. Listing HTML is parsed/saved through the existing private saver without another Bright Data read. Developer saves use the existing source hierarchy and workspace-safe project row helper. No action publishes, sends invitations or transfers existing inventory. This is not a public table-write proxy.

No external worker is deployed by editing the web app. The existing `cloud-runner` is for Facebook, not a Yad2 importer. Follow `worker/README.md` for the TORAFF Railway deployment and exact environment variables. Until that worker is enabled and connected, new tasks stay queued and no Bright Data requests are made for them. Personal developer self-import is a separate workflow and is unchanged by this Super Admin queue change.