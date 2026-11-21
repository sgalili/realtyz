# TORAFF Railway import worker

This folder is an external **background process**, not a web/backend server in the Lovable preview. It runs on Railway's existing TORAFF deployment using Node 20+. Bright Data requests and recursive discovery run here; Cloud receives only short queue operations and authorized identity/inventory saves. Existing pure Yad2 parsers are imported from the repository rather than reimplemented.

## Required Railway environment variables

| Name | Value |
|---|---|
| `IMPORT_WORKER_ENABLED` | `true` |
| `TORAFF_IMPORT_API_URL` | Full HTTPS URL of the deployed `external-import-worker` Cloud function, including `/functions/v1/external-import-worker`; use the project's Cloud function origin, not the website URL. |
| `IMPORT_WORKER_SHARED_SECRET` | Exact same generated value copied from the Lovable secure form. Never the Cloud service-role key. |
| `BRIGHT_DATA_API_KEY` | Bright Data REST API token with access to the Web Unlocker zone. |
| `BRIGHTDATA_UNLOCKER_ZONE` | Exact existing **Web Unlocker** zone name from Bright Data. A Browser API zone is not interchangeable. |
| `IMPORT_WORKER_ID` | Optional unique instance label, e.g. `railway-toraff-1`. |

No browser credentials, database password, Cloud service-role key, Browser API WebSocket endpoint or `PORT` is needed by this process. These are worker environment variables; entering secrets in Lovable does not set Railway's environment.

## Install and run from repository root

```bash
npm --prefix worker install
npm --prefix worker start
```

Railway must deploy this full repository because the worker imports shared source files. For a **separate background worker service** using the same repository: leave Root Directory at repository root, set Build Command `npm --prefix worker install`, Start Command `npm --prefix worker start`, and disable any HTTP healthcheck for that background service.

Do not replace an existing Production web service's start command with a background process. To keep the existing TORAFF Node service, install worker dependencies in its build, then import `worker/register.ts` once from that service's startup using its TypeScript loader (or import and call `startImportWorker()` once). Its existing HTTP server and PORT stay unchanged. Deployment configuration/source of that existing Railway service must be checked before adding this startup hook; this repository does not establish its current entrypoint. `register.ts` reports worker configuration errors without shutting down the existing web service.

Jobs are claimed one at a time, heartbeat every 30 seconds, with 180-second fenced leases. Polling is in Railway (5 seconds when idle), not database cron or a browser scanner. Native source reads have a 120-second abort limit and at least a one-second gap. Retry deadlines/checkpoints live in Cloud, backoff is bounded at three minutes and eight failures end visibly. Stop signals finish/save the current safe checkpoint and release the job. Permanent credential/billing errors fail immediately. Existing accounts are checked before profile enrichment when source/license is known, and again before creation. Imported items remain private.

## Verification before enabling Production

Run `npm --prefix worker test`. Deploy with `IMPORT_WORKER_ENABLED=false`, configure all variables, then enable only after the machine endpoint accepts the shared credential. Start one small import and check the queued→running→completed progression, source logs, saved drafts and final counts. No paid Bright Data reads or real imports were run while preparing this folder.