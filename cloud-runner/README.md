# Realtyz Cloud Runner

Publishes Facebook group posts from the cloud, so posts go out even when your
computer is off.

## How it fits together

1. Realtyz stores each group post in the queue with its publish time.
2. Every 5 minutes the Realtyz server checks for posts that are due and have no
   active browser extension, and sends them to this runner.
3. This runner opens Facebook headlessly with your saved connection, writes the
   post (and the first comment, if any), and reports back "done" or "failed".
4. The status pill on the post card updates automatically.

## Run it

```bash
cd cloud-runner
npm install
CLOUD_WORKER_SHARED_SECRET=<the same secret saved in Realtyz> PORT=8787 npm start
```

Deploy anywhere reachable over HTTPS (Render, Railway, Fly, a VPS). On Render use
a Web Service, build `npm install`, start `npm start`.

Then send me the public URL of the runner (e.g. `https://runner.example.com/`)
and I'll connect it to Realtyz. Nothing else is needed on your side.

## Notes

- Save your Facebook connection first in Settings → Social networks → "פרסום מהענן".
  Cookies are encrypted before storage and are only decrypted when a job is sent here.
- The runner never stores anything; each job is handled in a fresh browser.
- Facebook changes its interface from time to time; if posting starts failing,
  the selectors in `index.js` are the place to adjust.
