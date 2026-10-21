# TORAFF Cloud Runner

Publishes Facebook group posts from the cloud, so posts go out even when your
computer is off.

## How it fits together

1. TORAFF stores each group post in the queue with its publish time.
2. The server dispatches due cloud posts and event-driven group joins to this runner.
3. This runner opens Facebook headlessly with your saved connection, writes the
   post (and the first comment, if any), and reports back "done" or "failed".
4. The status pill on the post card updates automatically.

## Run it

```bash
cd cloud-runner
npm install
CLOUD_WORKER_SHARED_SECRET=<the same secret saved in TORAFF> PORT=8787 npm start
```

Deploy anywhere reachable over HTTPS (Render, Railway, Fly, a VPS). On Render use
a Web Service, build `npm install`, start `npm start`.

Then send me the public URL of the runner (e.g. `https://runner.example.com/`)
and I'll connect it to TORAFF. Nothing else is needed on your side.

## Notes

- Set `CLOUD_CALLBACK_ORIGIN` to the Cloud function origin used by the dispatcher; callbacks reject all other origins.
- Redeploy this worker to enable `group_join` and `group_fetch`. Code changes in the app do not redeploy Railway.
- Joins are serialized per workspace and spaced by two minutes. Facebook approval is never treated as confirmed membership; checkpoints pause the connection.
- Membership questions use only owner-supplied answers with explicit rule consent. Unsupported question types require completion in the remote cloud browser.

- Save your Facebook connection first in Settings → Social networks → "פרסום מהענן".
  Cookies are encrypted before storage and are only decrypted when a job is sent here.
- The runner never stores anything; each job is handled in a fresh browser.
- Facebook changes its interface from time to time; if posting starts failing,
  the selectors in `index.js` are the place to adjust.
