/* Realtyz Group Sync — background worker.
 *
 * Every 60 seconds (while the browser is open) it asks the Realtyz backend for
 * Facebook group posts that are due, opens the group in a background tab,
 * runs the local posting automation (poster.js) and reports the outcome back.
 */

/* Startup marker: must be the very first executable statement so the extension
 * console proves the service worker parsed and evaluated the whole file. */
try {
  console.log('[Realtyz] Background worker initialized successfully');
} catch (e) { /* noop */ }

/* Top-level safety net: an unhandled rejection anywhere in the worker would
 * otherwise kill the listener registrations silently. */
try {
  self.addEventListener('unhandledrejection', (event) => {
    try { console.error('[Realtyz] Unhandled rejection in background worker:', event && event.reason); } catch (e) { /* noop */ }
    try { event.preventDefault(); } catch (e) { /* noop */ }
  });
  self.addEventListener('error', (event) => {
    try { console.error('[Realtyz] Background worker error:', event && event.message); } catch (e) { /* noop */ }
  });
} catch (e) { /* noop */ }

const SUPABASE_URL = 'https://gvylyghwfysvydygqdtf.supabase.co';
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2eWx5Z2h3ZnlzdnlkeWdxZHRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MjMxMDEsImV4cCI6MjA5NTk5OTEwMX0.3_sZy9BP9GIXO1yA1PoFYVdO0tDYzx7oFbfflsdk3aE';

const ALARM = 'rz-queue-poll';
const TOKEN_KEY = 'rzSyncToken';
const STATE_KEY = 'rzQueueState';
const JOB_TIMEOUT_MS = 4 * 60 * 1000; // hard ceiling per job

let running = false;
/** Last failure reason produced by report(), used for queue stage details. */
let lastJobReason = null;

/* ── live per-job stage (progress feedback for the web app) ──────────────── */
const JOB_STAGES = ['queued', 'navigating', 'writing', 'commenting', 'completed', 'failed'];

async function setJobStage(jobId, stage, extra) {
  if (!jobId || JOB_STAGES.indexOf(stage) < 0) return;
  const id = String(jobId).replace(/^queue-/, '');
  const queue = await loadQueue();
  const hit = queue.find((e) => e && String(e.id) === id);
  if (!hit) return;
  hit.stage = stage;
  hit.stageAt = Date.now();
  if (extra && typeof extra === 'object') Object.assign(hit, extra);
  await saveQueue(queue);
}

/* ── helpers ────────────────────────────────────────────────────────────── */

const getToken = () =>
  new Promise((resolve) => chrome.storage.local.get([TOKEN_KEY], (r) => resolve((r || {})[TOKEN_KEY] || null)));

const setState = (patch) =>
  new Promise((resolve) => {
    chrome.storage.local.get([STATE_KEY], (r) => {
      const next = Object.assign({}, (r || {})[STATE_KEY] || {}, patch, { updated_at: Date.now() });
      chrome.storage.local.set({ [STATE_KEY]: next }, () => resolve(next));
    });
  });

const api = async (fn, body) => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });
  let json = {};
  try { json = await res.json(); } catch (e) { /* noop */ }
  return { status: res.status, json };
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Event-driven load wait: resolves on chrome.tabs.onUpdated 'complete', or
 * false only when the tab actually disappears. No blind timer closes the tab. */
const waitForTabLoad = (tabId) =>
  new Promise((resolve) => {
    let settled = false;
    const finish = (v) => {
      if (settled) return;
      settled = true;
      chrome.tabs.onUpdated.removeListener(onUpd);
      chrome.tabs.onRemoved.removeListener(onRem);
      resolve(v);
    };
    const onUpd = (id, info) => { if (id === tabId && info.status === 'complete') finish(true); };
    const onRem = (id) => { if (id === tabId) finish(false); };
    chrome.tabs.onUpdated.addListener(onUpd);
    chrome.tabs.onRemoved.addListener(onRem);
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError || !tab) return finish(false);
      if (tab.status === 'complete') finish(true);
    });
  });

const FB_POSTER_URL = /^https:\/\/([a-z0-9-]+\.)?facebook\.com\/(groups\/|[^?#]*\/posts\/|[^?#]*\/permalink\/|permalink\.php|story\.php|photo|[^?#]*\/videos\/)/i;

/* Fail-safe: if the static content script missed, inject poster.js explicitly. */
const pingPoster = (tabId) =>
  new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, { source: 'realtyz-extension', type: 'RZ_POSTER_PING' }, (res) => {
        if (chrome.runtime.lastError) return resolve(false);
        resolve(!!(res && res.alive));
      });
    } catch (e) { resolve(false); }
  });

const ensurePoster = async (tabId) => {
  if (await pingPoster(tabId)) return true;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['poster.js'] });
  } catch (e) { return false; }
  for (let i = 0; i < 10; i++) {
    if (await pingPoster(tabId)) return true;
    await sleep(300);
  }
  return false;
};

// Any Facebook group/post tab that finishes loading gets the poster guaranteed.
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status !== 'complete' || !tab || !tab.url || !FB_POSTER_URL.test(tab.url)) return;
  ensurePoster(tabId).catch(() => {});
});

/* Explicit completion handshake. The tab is never closed and the queue never
 * advances on a blind timer: we hand the job to the content script, it ACKs
 * acceptance, and we then wait for its final POST_SUCCESS / POST_FAILED
 * runtime message. The only other way out is the tab itself disappearing
 * (closed by the user / crashed), which is a real event, not a timer. */
const pendingAcks = new Map(); // jobId -> { tabId, resolve }

const settleAck = (jobId, result) => {
  const hit = pendingAcks.get(String(jobId));
  if (!hit) return false;
  pendingAcks.delete(String(jobId));
  hit.resolve(result);
  return true;
};

chrome.tabs.onRemoved.addListener((tabId) => {
  for (const [jobId, hit] of pendingAcks) {
    if (hit.tabId === tabId) settleAck(jobId, { ok: false, reason: 'לשונית הפרסום נסגרה לפני שהפעולה הסתיימה', tab_closed: true });
  }
});

// Keep the MV3 service worker alive while a job is in flight.
let keepAliveTimer = null;
const keepAlive = (on) => {
  if (on && !keepAliveTimer) keepAliveTimer = setInterval(() => { try { chrome.runtime.getPlatformInfo(() => chrome.runtime.lastError); } catch (e) { /* noop */ } }, 20000);
  if (!on && keepAliveTimer && pendingAcks.size === 0) { clearInterval(keepAliveTimer); keepAliveTimer = null; }
};

const sendToTab = (tabId, payload) =>
  new Promise((resolve) => {
    const jobId = String((payload && payload.job && payload.job.id) || '');
    const done = (res) => { keepAlive(false); resolve(res); };
    if (!jobId) return resolve({ ok: false, reason: 'חסר מזהה עבודה' });
    pendingAcks.set(jobId, { tabId, resolve: done });
    keepAlive(true);
    try {
      chrome.tabs.sendMessage(tabId, payload, (ack) => {
        if (chrome.runtime.lastError) {
          return settleAck(jobId, { ok: false, reason: 'לא ניתן להריץ את הפרסום בעמוד הקבוצה' });
        }
        // Rejected up-front (bad id / duplicate) — that's already final.
        if (!ack || ack.accepted !== true) {
          settleAck(jobId, ack || { ok: false, reason: 'עמוד הקבוצה לא אישר את קבלת המשימה' });
        }
        // accepted: keep waiting for POST_SUCCESS / POST_FAILED.
      });
    } catch (e) {
      settleAck(jobId, { ok: false, reason: String((e && e.message) || e) });
    }
  });

/* Accepts full desktop URLs, m./mbasic. URLs, relative "/groups/123" hrefs and
 * bare ids — always returns an absolute https://www.facebook.com/groups/<id>. */
const RESERVED_GROUP_SEGMENTS = ['joins', 'feed', 'discover', 'create', 'search', 'your_groups'];
const groupIdOf = (value) => {
  const raw = String(value || '').trim().replace(/^ext:/, '');
  if (!raw) return null;
  const m = raw.match(/(?:facebook\.com|fb\.com)\/groups\/([^/?#\s]+)|(?:^|\/)groups\/([^/?#\s]+)/i);
  let id = m ? (m[1] || m[2]) : (/^[A-Za-z0-9._-]{3,}$/.test(raw) && !raw.includes('.com') ? raw : null);
  if (!id) return null;
  try { id = decodeURIComponent(id); } catch (e) { /* keep raw */ }
  id = id.trim();
  if (!id || RESERVED_GROUP_SEGMENTS.includes(id.toLowerCase())) return null;
  return id;
};
const absoluteGroupUrl = (value) => {
  const id = groupIdOf(value);
  return id ? `https://www.facebook.com/groups/${encodeURIComponent(id)}` : null;
};
const groupUrl = (job) => absoluteGroupUrl(job.group_url) || absoluteGroupUrl(job.group_id);

/* ── execution guards ────────────────────────────────────────────────────
 * The worker must never act on the personal newsfeed / profile, never repeat
 * a job, and never exceed a human posting pace. All three are enforced here,
 * before a tab is ever opened.
 */
const AUTOMATION_FLAG = 'rzAutomationEnabled';
const DONE_KEY = 'rzDoneJobs';
const RATE_KEY = 'rzActionRate';
const ACTIVE_WORKSPACE_KEY = 'rzActiveWorkspaceOwner';
const MAX_PER_HOUR = 12;
const MAX_PER_DAY = 60;
const DEFERRED = 'deferred';
const DEFER_MS = 15 * 60 * 1000;

const BLOCKED_URL = /facebook\.com\/(?:$|\?|home|profile\.php|me(?:\/|$)|watch|marketplace|reels|stories|messages|notifications|friends|bookmarks|settings)/i;

/** A post permalink we are allowed to comment on. */
const isPostUrl = (value) => {
  const url = String(value || '').trim();
  if (!/^https:\/\/(?:www\.|m\.|mbasic\.)?facebook\.com\//i.test(url)) return false;
  if (BLOCKED_URL.test(url)) return false;
  return /(?:\/posts\/|\/permalink|permalink\.php|story_fbid=|multi_permalinks=|pfbid|\/photo|\/videos\/|comment_id=)/i.test(url);
};

const local = (keys) => new Promise((resolve) => chrome.storage.local.get(keys, (r) => resolve(r || {})));
const localSet = (patch) => new Promise((resolve) => chrome.storage.local.set(patch, () => resolve()));

const automationEnabled = async () => {
  const r = await local([AUTOMATION_FLAG]);
  return r[AUTOMATION_FLAG] !== false; // default on, explicit false stops everything
};

/** Persisted one-shot ledger keyed by job id and target post/group. */
const jobKey = (entry) =>
  [String((entry && (entry.dedupe_key || entry.id)) || ''), String((entry && (entry.postId || entry.post_id)) || ''), String((entry && (entry.postUrl || entry.groupUrl)) || '')]
    .filter(Boolean)
    .join('|');

const alreadyDone = async (entry) => {
  const key = jobKey(entry);
  if (!key) return true; // no identity → refuse
  const r = await local([DONE_KEY]);
  const ledger = (r[DONE_KEY] && typeof r[DONE_KEY] === 'object') ? r[DONE_KEY] : {};
  const v = ledger[key];
  if (!v) return false;
  // Legacy numeric entries carry no outcome — treat as unverified.
  if (typeof v === 'object' && v.outcome === 'posted') return 'posted';
  return 'ambiguous';
};

const markDone = async (entry, outcome = 'posted') => {
  const key = jobKey(entry);
  if (!key) return;
  const r = await local([DONE_KEY]);
  const ledger = (r[DONE_KEY] && typeof r[DONE_KEY] === 'object') ? r[DONE_KEY] : {};
  ledger[key] = { at: Date.now(), outcome };
  // keep the ledger small: drop entries older than 30 days
  const cutoff = Date.now() - 30 * 86400000;
  for (const k of Object.keys(ledger)) { const v = ledger[k]; const at = typeof v === 'object' && v ? Number(v.at) : Number(v); if (!(at >= cutoff)) delete ledger[k]; }
  await localSet({ [DONE_KEY]: ledger });
};

/** Rolling rate limit so the automation can never spam in a loop. */
const rateAllows = async () => {
  const r = await local([RATE_KEY]);
  const stamps = Array.isArray(r[RATE_KEY]) ? r[RATE_KEY].map(Number).filter(Boolean) : [];
  const now = Date.now();
  const hour = stamps.filter((t) => now - t < 3600000).length;
  const day = stamps.filter((t) => now - t < 86400000).length;
  return hour < MAX_PER_HOUR && day < MAX_PER_DAY;
};

const rateRecord = async () => {
  const r = await local([RATE_KEY]);
  const stamps = Array.isArray(r[RATE_KEY]) ? r[RATE_KEY].map(Number).filter(Boolean) : [];
  const now = Date.now();
  await localSet({ [RATE_KEY]: [...stamps.filter((t) => now - t < 86400000), now] });
};

/* ── one job ────────────────────────────────────────────────────────────── */

// In-memory lock: the same job (by dedupe key) can never run twice at once,
// even if it arrives from the local queue, the cloud claim and an instant
// handoff simultaneously.
const inflight = new Set();

async function runJob(token, job) {
  const dedupe = String(job.dedupe_key || job.id || '');
  const lockKey = `${dedupe}|${groupUrl(job) || ''}`;
  if (inflight.has(lockKey)) return report(token, job, false, 'הפוסט כבר בתהליך פרסום');
  inflight.add(lockKey);
  try {
    return await runJobInner(token, { ...job, dedupe_key: dedupe });
  } finally {
    inflight.delete(lockKey);
  }
}

async function runJobInner(token, job) {
  const destinationLink = String(job.link || '').trim();
  const message = String(job.message || '').trim();
  if (destinationLink && !message.includes(destinationLink)) {
    job = { ...job, message: `${message}\n\n${destinationLink}`.trim() };
  }
  const url = groupUrl(job);
  if (!url) return report(token, job, false, 'כתובת הקבוצה חסרה');
  if (BLOCKED_URL.test(url)) return report(token, job, false, 'הפעולה בוטלה: היעד אינו קבוצת פייסבוק');
  if (!(await automationEnabled())) return report(token, job, false, 'האוטומציה בדפדפן מושבתת');
  if (!String(job.message || '').trim()) return report(token, job, false, 'תוכן הפוסט ריק');
  const prior = await alreadyDone(job);
  if (prior === 'posted') return report(token, job, true, null, null);
  if (prior) return report(token, job, false, 'ניסיון קודם לא אומת — בדוק בקבוצה לפני פרסום חוזר');
  // Rate cap reached: never mark the job failed. Leave it queued (local) or let
  // the server lease expire (cloud) so it runs automatically in the next window.
  if (!(await rateAllows())) { lastJobReason = null; return DEFERRED; }
  await rateRecord();

  let tabId = null;
  let writingStarted = false;
  try {
    await setJobStage(job.id, 'navigating');
    const tab = await chrome.tabs.create({ url, active: false });
    tabId = tab.id;
    const loaded = await waitForTabLoad(tabId);
    if (!loaded) {
      await report(token, job, false, 'עמוד הקבוצה לא נטען בזמן');
      return;
    }
    await sleep(2500); // let Facebook hydrate the feed
    try {
      const t = await chrome.tabs.get(tabId);
      if (t && t.url && !/facebook\.com\/groups\//i.test(t.url)) {
        await report(token, job, false, 'פייסבוק הפנה מחוץ לקבוצה (התחברות/אימות נדרשים)');
        return false;
      }
    } catch (e) { /* noop */ }
    await setJobStage(job.id, 'writing');
    writingStarted = true;

    await ensurePoster(tabId);
    const result = await sendToTab(
      tabId,
      {
        source: 'realtyz-extension',
        type: 'RZ_POST_TO_GROUP',
        job: {
          id: job.id,
          message: job.message,
          image_url: job.image_url || null,
          image_urls: Array.isArray(job.image_urls) ? job.image_urls : (job.image_url ? [job.image_url] : []),
          first_comment: job.first_comment || null,
          link: job.link || null,
        },
      },
    );

    const requiredCommentFailed = Boolean(job.first_comment) && result.first_comment_ok !== true;
    const posted = result.ok === true && result.submitted === true && result.verified_in_feed === true;
    const verified = posted && !requiredCommentFailed;
    // Once Facebook accepted the post, never auto-repost it (even if feed
    // verification or the first comment failed) — that is what caused duplicates.
    if (posted) await markDone(job, 'posted');
    else if (result.submitted === true) await markDone(job, 'ambiguous');
    const reason = requiredCommentFailed
      ? (result.first_comment_error || 'הפוסט פורסם אך התגובה הראשונה לא נוספה')
      : !posted
        ? (result.reason || 'הפוסט לא אומת בקבוצה')
        : null;
    await report(token, job, verified, reason, result.post_url || null);
    return verified;
  } catch (e) {
    // A timeout after the composer was filled is ambiguous: the post may be
    // live. Lock it in the ledger so a retry can never publish it twice.
    if (writingStarted) await markDone(job, 'ambiguous');
    await report(token, job, false, writingStarted
      ? 'לא התקבל אישור מפייסבוק — בדוק בקבוצה לפני פרסום חוזר'
      : String((e && e.message) || e));
    return false;
  } finally {
    if (tabId != null) {
      try { await chrome.tabs.remove(tabId); } catch (e) { /* noop */ }
    }
  }
}

async function runPageFirstComment(token, entry) {
  const postId = String(entry.postId || entry.post_id || '').trim();
  // Prefer the permalink; fall back to a permalink built from the post id.
  const postUrl =
    String(entry.postUrl || entry.post_url || '').trim() ||
    (postId ? `https://www.facebook.com/${postId.replace('_', '/posts/')}` : '');
  const message = String(entry.firstComment || entry.first_comment || '').trim();
  if (!postUrl) {
    await report(token, { id: entry.id, local: true }, false, 'כתובת הפוסט חסרה');
    return false;
  }
  if (!message) {
    await report(token, { id: entry.id, local: true }, false, 'תוכן התגובה הראשונה ריק');
    return false;
  }
  if (!isPostUrl(postUrl)) {
    await report(token, { id: entry.id, local: true }, false, 'הפעולה בוטלה: היעד אינו כתובת של פוסט ספציפי');
    return false;
  }
  if (!(await automationEnabled())) {
    await report(token, { id: entry.id, local: true }, false, 'האוטומציה בדפדפן מושבתת');
    return false;
  }
  if (await alreadyDone({ ...entry, postUrl })) {
    await report(token, { id: entry.id, local: true }, false, 'התגובה הזו כבר בוצעה בעבר');
    return false;
  }
  if (!(await rateAllows())) {
    await report(token, { id: entry.id, local: true }, false, 'הגעת לתקרת התגובות לשעה — הפעולה תרוץ בהמשך');
    return false;
  }
  await markDone({ ...entry, postUrl });
  await rateRecord();

  let tabId = null;
  try {
    await setJobStage(entry.id, 'navigating');
    const tab = await chrome.tabs.create({ url: postUrl, active: false });
    tabId = tab.id;
    const loaded = await waitForTabLoad(tabId);
    if (!loaded) {
      await report(token, { id: entry.id, local: true }, false, 'עמוד הפוסט לא נטען בזמן');
      return false;
    }
    await sleep(2500);
    await setJobStage(entry.id, 'commenting');

    await ensurePoster(tabId);
    const result = await sendToTab(
      tabId,
      {
        source: 'realtyz-extension',
        type: 'RZ_POST_FIRST_COMMENT',
        job: {
          id: entry.id,
          post_url: postUrl,
          post_id: postId || null,
          message,
        },
      },
    );

    await report(token, { id: entry.id, local: true }, result.ok === true, result.reason || null, result.post_url || postUrl);
    return result.ok === true;
  } catch (e) {
    await report(token, { id: entry.id, local: true }, false, String((e && e.message) || e));
    return false;
  } finally {
    if (tabId != null) {
      try { await chrome.tabs.remove(tabId); } catch (e) { /* noop */ }
    }
  }
}

async function report(token, job, ok, reason, postUrl) {
  lastJobReason = ok ? null : (reason || 'פרסום בדפדפן נכשל');

  // Local (app-triggered) jobs have no backend queue row — skip the report call.
  if (token && !job.local) {
    await api('ext-queue-report', {
      token,
      job_id: job.id,
      ok: !!ok,
      reason: ok ? null : (reason || 'פרסום בדפדפן נכשל'),
      post_url: postUrl || null,
    });
  }
  await setState(
    ok
      ? { last_success_at: Date.now(), last_error: null }
      : { last_error: reason || 'פרסום בדפדפן נכשל', last_error_at: Date.now() },
  );
}

/* ── local instant posting (handed over by the app) ──────────────────────── */

let localRunning = false;

async function runLocalPost(post) {
  if (localRunning) return { ok: false, reason: 'פרסום מקומי אחר עדיין רץ' };
  localRunning = true;
  const token = await getToken();
  const groups = Array.isArray(post && post.groups) ? post.groups : [];
  const text = String((post && (post.text || post.message)) || '').trim();
  const image =
    (post && post.image_url) ||
    (Array.isArray(post && post.images) && post.images[0]) ||
    (Array.isArray(post && post.imageUrls) && post.imageUrls[0]) ||
    null;

  let done = 0;
  const failures = [];
  try {
    await setState({ local_total: groups.length, local_done: 0, local_started_at: Date.now(), last_error: null });
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i] || {};
      const ok = await runJob(token, {
        id: `local-${Date.now()}-${i}`,
        local: true,
        group_id: String(g.group_id || g.id || '').replace(/^ext:/, ''),
        group_url: g.group_url || g.url || null,
        message: text,
        image_url: image,
        image_urls: (Array.isArray(post && post.images) && post.images.length ? post.images
          : Array.isArray(post && post.imageUrls) ? post.imageUrls : (image ? [image] : [])),
        first_comment: post.firstComment || post.first_comment || null,
        link: post.link || null,
      });
      if (ok === DEFERRED) failures.push(g.group_name || g.group_id || '');
      else if (ok) done += 1;
      else failures.push(g.group_name || g.group_id || '');
      await setState({ local_done: done });
      if (i < groups.length - 1) await sleep(8000); // gentle pacing
    }
  } finally {
    localRunning = false;
    try { chrome.storage.local.remove(['rzPendingPost']); } catch (e) { /* noop */ }
  }
  return { ok: failures.length === 0, posted: done, total: groups.length, failures };
}

/* ── local rzPostQueue drain (one entry per group) ───────────────────────── */

const QUEUE_KEY = 'rzPostQueue';
let queueRunning = false;

function saveQueue(queue) {
  return new Promise((res) => chrome.storage.local.set({ [QUEUE_KEY]: queue }, res));
}
function loadQueue() {
  return new Promise((res) => chrome.storage.local.get([QUEUE_KEY], (r) => res(((r || {})[QUEUE_KEY]) || [])));
}

const TOMB_KEY = 'rzQueueTombstones';
function loadTombs() {
  return new Promise((res) => chrome.storage.local.get([TOMB_KEY], (r) => {
    const t = (r || {})[TOMB_KEY] || {};
    res({ ids: Array.isArray(t.ids) ? t.ids : [], keys: Array.isArray(t.keys) ? t.keys : [] });
  }));
}
function isTomb(e, t) {
  if (!e) return true;
  if (t.ids.includes(String(e.id))) return true;
  const body = qTextKey(e.text) || qTextKey(e.firstComment);
  return !!body && t.keys.some((k) => body.indexOf(k) >= 0 || k.indexOf(body) >= 0);
}

async function mergeQueue(incoming) {
  const tombs = await loadTombs();
  const current = (await loadQueue()).filter((e) => !isTomb(e, tombs));
  const byId = new Map(current.map((e) => [String(e.id), e]));
  for (const e of incoming || []) {
    if (!e || !e.id || isTomb(e, tombs)) continue;
    if (!byId.has(String(e.id))) byId.set(String(e.id), e);
  }
  const merged = Array.from(byId.values());
  await saveQueue(merged);
  return merged;
}

const qTextKey = (t) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 40);

// Posts deleted in the web app must never be published: drop their jobs.
async function removeQueueJobs(ids, textKeys) {
  const idSet = new Set((ids || []).map((i) => String(i)));
  const keys = (textKeys || []).map(qTextKey).filter(Boolean);
  const tombs = await loadTombs();
  await new Promise((res) => chrome.storage.local.set({ [TOMB_KEY]: {
    ids: [...new Set([...tombs.ids, ...idSet])].slice(-500),
    keys: [...new Set([...tombs.keys, ...keys])].slice(-500),
  } }, res));
  const current = await loadQueue();
  const next = current.filter((e) => {
    if (!e) return false;
    if (idSet.has(String(e.id))) return false;
    const body = qTextKey(e.text) || qTextKey(e.firstComment);
    if (body && keys.some((k) => body.indexOf(k) >= 0 || k.indexOf(body) >= 0)) return false;
    return true;
  });
  if (next.length !== current.length) await saveQueue(next);
  return next;
}

const STALE_POSTING_MS = 6 * 60 * 1000;

async function drainQueue() {
  if (queueRunning) return;
  if (!(await automationEnabled())) return; // master kill switch
  queueRunning = true;
  try {
    const token = await getToken();
    let queue = await loadQueue();
    const activeState = await local([ACTIVE_WORKSPACE_KEY]);
    const activeWorkspaceOwner = String(activeState[ACTIVE_WORKSPACE_KEY] || '').trim();
    // Recover jobs left "posting" by a killed service worker so nothing hangs.
    let recovered = false;
    for (const e of queue) {
      if (e && e.status === 'posting' && Date.now() - Number(e.startedAt || e.createdAt || 0) > STALE_POSTING_MS) {
        e.status = 'pending';
        e.stage = 'queued';
        e.startedAt = null;
        recovered = true;
      }
    }
    if (recovered) await saveQueue(queue);

    // Comments first: a first comment must land right under the fresh post.
    const ordered = queue
      .slice()
      .sort((a, b) => (b && (b.type === 'page_first_comment') ? 1 : 0) - (a && (a.type === 'page_first_comment') ? 1 : 0));
    for (const entry of ordered) {
      if (!entry || entry.status !== 'pending') continue;
      // Browser storage is shared across tenants. Execute only jobs belonging
      // to the workspace currently open in the Realtyz app.
      if (!activeWorkspaceOwner || entry.workspaceOwnerId !== activeWorkspaceOwner) continue;
      if (Number(entry.scheduledTime || 0) > Date.now()) continue;

      entry.status = 'posting';
      entry.stage = 'queued';
      entry.stageAt = Date.now();
      entry.error = null;
      entry.startedAt = Date.now();
      await saveQueue(queue);

      let ok = false;
      lastJobReason = null;
      if (entry.type === 'page_first_comment' || entry.postId || entry.postUrl) {
        ok = await runPageFirstComment(token, entry);
      } else {
        ok = await runJob(token, {
          id: `queue-${entry.id}`,
          dedupe_key: String(entry.id),
          local: true,
          group_id: '',
          group_url: entry.groupUrl,
          message: String(entry.text || ''),
          image_url: (Array.isArray(entry.images) && entry.images[0]) || null,
          image_urls: Array.isArray(entry.images) ? entry.images : [],
          first_comment: entry.firstComment || null,
          link: entry.link || null,
        });
      }
      if (ok === DEFERRED) {
        queue = await loadQueue();
        const hit = queue.find((e) => String(e.id) === String(entry.id));
        if (hit) {
          hit.status = 'pending';
          hit.stage = 'queued';
          hit.error = null;
          hit.startedAt = null;
          hit.scheduledTime = Date.now() + DEFER_MS;
        }
        await saveQueue(queue);
        break; // cap reached — stop this drain, resume next window
      }
      entry.status = ok ? 'completed' : 'failed';
      const failReason = ok ? null : (lastJobReason || 'פרסום בדפדפן נכשל');
      queue = await loadQueue().then((fresh) => {
        const hit = fresh.find((e) => String(e.id) === String(entry.id));
        if (hit) {
          hit.status = entry.status;
          hit.stage = ok ? 'completed' : 'failed';
          hit.stageAt = Date.now();
          hit.error = failReason;
          hit.startedAt = null;
          hit.finishedAt = Date.now();
        }
        return fresh;
      });
      await saveQueue(queue);
      // Comments are quick and time-sensitive; only pace real group posts.
      await sleep(entry.type === 'page_first_comment' ? 1500 : 8000);
    }
    // Drop finished entries older than a day so storage stays small.
    const kept = (await loadQueue()).filter(
      (e) => e && (e.status === 'pending' || Date.now() - Number(e.createdAt || 0) < 86400000),
    );
    await saveQueue(kept);
  } catch (e) {
    await setState({ last_error: String((e && e.message) || e) });
  } finally {
    queueRunning = false;
  }
}


/* ── poll loop ──────────────────────────────────────────────────────────── */



async function poll() {
  if (running) return;
  running = true;
  try {
    // The local browser queue runs regardless of Realtyz pairing.
    await drainQueue();
    const token = await getToken();
    if (!token) {
      await setState({ paired: false, last_error: 'התוסף לא מחובר לחשבון Realtyz' });
      return;
    }

    const { status, json } = await api('ext-queue-claim', {
      token,
      limit: 2,
      user_agent: navigator.userAgent,
    });

    if (status === 401) {
      await setState({ paired: false, last_error: 'מפתח הסנכרון אינו תקף — חבר את התוסף מחדש' });
      return;
    }
    if (!json || json.ok !== true) {
      await setState({ paired: true, last_error: 'החיבור לשרת Realtyz נכשל' });
      return;
    }

    await setState({ paired: true, last_poll_at: Date.now(), last_error: null });

    const jobs = Array.isArray(json.jobs) ? json.jobs : [];
    for (const job of jobs) {
      await runJob(token, job);
      await sleep(8000); // gentle pacing between group posts
    }
  } catch (e) {
    await setState({ last_error: String((e && e.message) || e) });
  } finally {
    running = false;
  }
}

/* Queue/alarm initialization — wrapped so a storage or alarm API hiccup at
 * browser startup can never crash the worker before its listeners register. */
const initQueue = () => {
  try {
    chrome.alarms.create(ALARM, { periodInMinutes: 1 });
  } catch (e) {
    try { console.error('[Realtyz] Failed to create queue alarm:', e); } catch (e2) { /* noop */ }
  }
  try { poll(); } catch (e) { try { console.error('[Realtyz] Initial queue poll failed:', e); } catch (e2) { /* noop */ } }
};

try { chrome.alarms.create(ALARM, { periodInMinutes: 1 }); } catch (e) { /* noop */ }
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name !== ALARM) return;
  try { poll(); } catch (e) { try { console.error('[Realtyz] Queue poll failed:', e); } catch (e2) { /* noop */ } }
});
chrome.runtime.onInstalled.addListener(() => initQueue());
chrome.runtime.onStartup.addListener(() => initQueue());

/* ── messages from the app page (content.js) and from the web app itself ── */

const handleMessage = (msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'RZ_EXT_PAIR' && typeof msg.token === 'string' && msg.token) {
    chrome.storage.local.set({ [TOKEN_KEY]: msg.token }, async () => {
      await setState({ paired: true, last_error: null });
      poll();
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === 'RZ_EXT_STATUS') {
    chrome.storage.local.get([TOKEN_KEY, STATE_KEY], (r) => {
      const state = (r || {})[STATE_KEY] || {};
      sendResponse({ ok: true, paired: !!(r || {})[TOKEN_KEY], state });
    });
    return true;
  }

  if (msg.type === 'RZ_START_POSTING' && msg.post) {
    chrome.storage.local.set({ rzPendingPost: msg.post }, () => {
      runLocalPost(msg.post).then((res) => {
        try { sendResponse(res); } catch (e) { /* noop */ }
      });
    });
    return true;
  }

  if (msg.type === 'RZ_QUEUE_UPDATE') {
    // Merge, answer immediately, then start the run without waiting.
    mergeQueue(msg.queue).then((merged) => {
      try { sendResponse({ ok: true, queue: merged }); } catch (e) { /* noop */ }
      drainQueue();
    });
    return true;
  }

  if (msg.type === 'RZ_WORKSPACE_ACTIVATE' && typeof msg.workspaceOwnerId === 'string') {
    chrome.storage.local.set({ [ACTIVE_WORKSPACE_KEY]: msg.workspaceOwnerId }, () => {
      drainQueue();
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === 'RZ_QUEUE_REMOVE') {
    removeQueueJobs(msg.ids, msg.textKeys).then((queue) => {
      try { sendResponse({ ok: true, queue }); } catch (e) { /* noop */ }
    });
    return true;
  }

  if ((msg.type === 'POST_SUCCESS' || msg.type === 'POST_FAILED') && msg.jobId) {
    const result = { ...(msg.result || {}), ok: msg.type === 'POST_SUCCESS' && (msg.result ? msg.result.ok !== false : true) };
    settleAck(msg.jobId, result);
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'RZ_JOB_STAGE') {
    setJobStage(msg.jobId, msg.stage).then(() => {
      try { sendResponse({ ok: true }); } catch (e) { /* noop */ }
    });
    return true;
  }

  if (msg.type === 'RZ_QUEUE_STATE_REQUEST') {
    loadQueue().then((queue) => {
      try { sendResponse({ ok: true, queue }); } catch (e) { /* noop */ }
    });
    return true;
  }

  if (msg.type === 'RZ_EXT_POLL_NOW') {
    poll();
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'RZ_EXT_UNPAIR') {
    chrome.storage.local.remove([TOKEN_KEY], () => sendResponse({ ok: true }));
    return true;
  }
};

chrome.runtime.onMessage.addListener(handleMessage);

/* Direct web-app bridge: the Realtyz dashboard can message the extension
 * without the content script when the origin is listed in
 * manifest.externally_connectable. Same handlers, same semantics. */
try {
  chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
    try {
      const origin = String((sender && sender.url) || '');
      const allowed =
        /^https:\/\/([a-z0-9-]+\.)?realtyz\.co\.il\//i.test(origin) ||
        /^https:\/\/[a-z0-9-]+\.lovable\.app\//i.test(origin) ||
        /^https:\/\/[a-z0-9-]+\.lovableproject\.com\//i.test(origin) ||
        /^https:\/\/[a-z0-9-]+\.lovable\.dev\//i.test(origin);
      if (!allowed) {
        try { sendResponse({ ok: false, error: 'origin_not_allowed' }); } catch (e) { /* noop */ }
        return true;
      }
      return handleMessage(msg, sender, sendResponse);
    } catch (e) {
      try { console.error('[Realtyz] External message handling failed:', e); } catch (e2) { /* noop */ }
      try { sendResponse({ ok: false, error: String((e && e.message) || e) }); } catch (e2) { /* noop */ }
      return true;
    }
  });
} catch (e) {
  try { console.error('[Realtyz] Failed to register external message listener:', e); } catch (e2) { /* noop */ }
}

/* ── Live engagement metrics ────────────────────────────────────────────
 * Every 30 min (and never while a posting job runs) the extension opens up
 * to 3 of this workspace's published group posts in a background tab, reads
 * the visible like/comment/share counters, and reports them back. Read-only:
 * it never clicks, reacts or comments. */
const METRICS_ALARM = 'rz-metrics';
let metricsRunning = false;

function scrapeEngagementInPage() {
  const parseNum = (s) => {
    if (!s) return null;
    const t = String(s).replace(/[,\u200f\u200e\s]/g, '').toUpperCase();
    const m = t.match(/(\d+(?:\.\d+)?)(K|M|אלף|מיליון)?/);
    if (!m) return null;
    let n = parseFloat(m[1]);
    if (m[2] === 'K' || m[2] === 'אלף') n *= 1000;
    if (m[2] === 'M' || m[2] === 'מיליון') n *= 1000000;
    return Math.round(n);
  };
  const root = document.querySelector('[role="article"]') || document.querySelector('[role="main"]') || document.body;
  const texts = Array.from(root.querySelectorAll('span, div[role="button"], a')).slice(0, 4000)
    .map((el) => (el.getAttribute('aria-label') || el.textContent || '').trim())
    .filter((t) => t && t.length < 80);
  const pick = (re) => { for (const t of texts) { if (re.test(t)) { const n = parseNum(t); if (n != null) return n; } } return null; };
  let likes = pick(/(reactions?|תגובות רגשיות|אהבו|לייק|likes?)/i);
  if (likes == null) {
    const r = root.querySelector('[aria-label*="All reactions"], [aria-label*="כל התגובות"]');
    likes = r ? parseNum(r.parentElement && r.parentElement.textContent) : null;
  }
  const comments = pick(/(\d[\d.,KM]*\s*(comments?|תגובות|תגובה))|((comments?|תגובות):?\s*\d)/i);
  const shares = pick(/(\d[\d.,KM]*\s*(shares?|שיתופים|שיתוף))|((shares?|שיתופים):?\s*\d)/i);
  return { likes: likes || 0, comments: comments || 0, shares: shares || 0 };
}

async function syncMetrics() {
  if (metricsRunning || (typeof running !== 'undefined' && running)) return;
  const token = await getToken();
  if (!token) return;
  metricsRunning = true;
  try {
    const { json } = await api('ext-metrics', { token, action: 'targets', limit: 3 });
    const targets = Array.isArray(json && json.targets) ? json.targets : [];
    for (const t of targets) {
      if (typeof running !== 'undefined' && running) break;
      if (!t || !t.job_id || !/^https:\/\/(www\.|m\.)?facebook\.com\//.test(t.post_url || '')) continue;
      let tabId = null;
      try {
        const tab = await chrome.tabs.create({ url: t.post_url, active: false });
        tabId = tab.id;
        if (!(await waitForTabLoad(tabId))) continue;
        await sleep(4000 + Math.floor(Math.random() * 3000));
        const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: scrapeEngagementInPage });
        const m = (res && res.result) || null;
        if (m) await api('ext-metrics', { token, action: 'report', job_id: t.job_id, likes: m.likes, comments: m.comments, shares: m.shares });
      } catch (e) {
        try { console.warn('[Realtyz] metrics scrape failed', e); } catch (e2) { /* noop */ }
      } finally {
        if (tabId != null) { try { await chrome.tabs.remove(tabId); } catch (e) { /* noop */ } }
      }
      await sleep(5000 + Math.floor(Math.random() * 5000));
    }
  } finally {
    metricsRunning = false;
  }
}

try { chrome.alarms.create(METRICS_ALARM, { periodInMinutes: 30, delayInMinutes: 2 }); } catch (e) { /* noop */ }
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name !== METRICS_ALARM) return;
  syncMetrics().catch(() => {});
});
chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
  if (msg && msg.type === 'RZ_SYNC_METRICS') { syncMetrics().finally(() => sendResponse({ ok: true })); return true; }
});


/* ── Group discovery: keyword search + auto-join (runs in the broker's own browser) ── */

const rzWait = (ms) => new Promise((r) => setTimeout(r, ms));

async function rzOpenAndWait(url) {
  const tab = await chrome.tabs.create({ url, active: false });
  // 1) Wait for the tab to fully finish loading (status === 'complete').
  await new Promise((resolve) => {
    const t = setTimeout(resolve, 25000);
    const l = (id, info) => { if (id === tab.id && info.status === 'complete') { clearTimeout(t); chrome.tabs.onUpdated.removeListener(l); resolve(); } };
    chrome.tabs.onUpdated.addListener(l);
    // If it was already complete before the listener attached, resolve immediately.
    chrome.tabs.get(tab.id).then((cur) => { if (cur && cur.status === 'complete') { clearTimeout(t); chrome.tabs.onUpdated.removeListener(l); resolve(); } }).catch(() => {});
  });
  // 2) Facebook renders its React feed after 'complete' — poll until the feed/posts exist (max ~8s), then settle 3s more.
  let ready = false;
  for (let i = 0; i < 8 && !ready; i++) {
    await rzWait(1000);
    try {
      const [r] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => !!(document.querySelector('[role="feed"]') || document.querySelector('div[role="article"]')),
      });
      ready = !!(r && r.result);
    } catch (e) { /* tab not injectable yet — keep waiting */ }
  }
  await rzWait(3000);
  return tab;
}

/** Runs inside facebook.com/search/groups — reads visible result cards. */
function rzScrapeGroupResults() {
  const parseNum = (txt) => {
    const m = String(txt || '').replace(/,/g, '').match(/([\d.]+)\s*(K|M|אלף|מיליון)?/i);
    if (!m) return null;
    const f = /M|מיליון/i.test(m[2] || '') ? 1e6 : /K|אלף/i.test(m[2] || '') ? 1e3 : 1;
    return Math.round(Number(m[1]) * f);
  };
  const out = new Map();
  document.querySelectorAll('a[href*="/groups/"]').forEach((a) => {
    const m = a.href.match(/facebook\.com\/groups\/([A-Za-z0-9._-]+)\/?(?:\?|$)/);
    if (!m || ['joins', 'feed', 'discover', 'create', 'search'].includes(m[1])) return;
    const name = (a.innerText || a.textContent || '').trim();
    if (!name || name.length < 2) return;
    const id = m[1];
    if (out.has(id)) return;
    let card = a;
    for (let i = 0; i < 8 && card.parentElement; i++) { card = card.parentElement; if ((card.innerText || '').length > name.length + 30) break; }
    const text = card.innerText || '';
    let members = null, ppd = null, activity = null;
    const mm = text.match(/([\d.,]+\s*(?:K|M|אלף|מיליון)?)\s*(?:members|חברים|חברות)/i);
    if (mm) members = parseNum(mm[1]);
    const am = text.match(/([\d.,]+\+?\s*(?:K)?)\s*(?:posts?|פוסטים|פרסומים)\s*(?:a|per|ב|ל)?\s*(day|week|יום|שבוע)/i);
    if (am) { const n = parseNum(am[1]) || 0; ppd = /week|שבוע/i.test(am[2]) ? n / 7 : n; activity = am[0]; }
    const img = card.querySelector('image, img');
    const icon = img ? (img.getAttribute('xlink:href') || img.getAttribute('href') || img.src || null) : null;
    const isMember = /(?:Joined|You're a member|חבר\/ה|הצטרפת|כבר חבר)/i.test(text) && !/(?:Join group|הצטרפות לקבוצה|הצטרף לקבוצה)/i.test(text);
    out.set(id, { group_id: id, group_name: name, group_url: 'https://www.facebook.com/groups/' + id,
      group_icon: icon, member_count: members, posts_per_day: ppd, activity_text: activity,
      privacy: /Private|פרטית/i.test(text) ? 'private' : (/Public|ציבורית/i.test(text) ? 'public' : null), is_member: isMember });
  });
  return [...out.values()];
}

async function rzSearchGroups(query) {
  const tab = await rzOpenAndWait('https://www.facebook.com/search/groups/?q=' + encodeURIComponent(query));
  try {
    for (let i = 0; i < 4; i++) {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => window.scrollBy(0, 2500) });
      await rzWait(1800);
    }
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: rzScrapeGroupResults });
    return (res && res.result) || [];
  } finally { try { await chrome.tabs.remove(tab.id); } catch (e) { /* noop */ } }
}

/** Runs inside a group page — clicks "Join" and reports the outcome. */
function rzClickJoin() {
  const btns = [...document.querySelectorAll('div[role="button"], a[role="button"], button')];
  const label = (b) => ((b.getAttribute('aria-label') || '') + ' ' + (b.innerText || '')).trim();
  if (btns.some((b) => /^(Joined|חבר\/ה|הצטרפת)/i.test(label(b)))) return 'already_member';
  if (btns.some((b) => /(Cancel request|ביטול בקשה)/i.test(label(b)))) return 'requested';
  const join = btns.find((b) => /(Join group|Join Group|הצטרפות לקבוצה|הצטרף לקבוצה|הצטרפות)/i.test(label(b)));
  if (!join) return 'failed';
  join.click();
  return 'clicked';
}
function rzJoinOutcome() {
  if (document.querySelector('div[role="dialog"] textarea, div[role="dialog"] input[type="text"], div[role="dialog"] input[type="radio"]')) return 'needs_answers';
  const text = document.body.innerText || '';
  if (/(Cancel request|ביטול בקשה|Request sent|הבקשה נשלחה)/i.test(text)) return 'requested';
  if (/(Joined|הצטרפת|חבר\/ה)/i.test(text)) return 'joined';
  return 'requested';
}

const rzJoinCancelled = new Set();

async function rzJoinGroups(requestId, groups, senderTabId) {
  const report = (payload) => { if (senderTabId != null) chrome.tabs.sendMessage(senderTabId, { type: 'RZ_FB_GROUP_JOIN_PROGRESS', requestId, ...payload }, () => chrome.runtime.lastError); };
  const list = groups.slice(0, 15);
  for (let i = 0; i < list.length; i++) {
    const g = list[i];
    if (rzJoinCancelled.has(requestId)) break;
    let status = 'failed', error;
    let tab;
    try {
      tab = await rzOpenAndWait(g.group_url || ('https://www.facebook.com/groups/' + g.group_id));
      const [r1] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: rzClickJoin });
      status = r1 && r1.result;
      if (status === 'clicked') {
        await rzWait(4000);
        const [r2] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: rzJoinOutcome });
        status = (r2 && r2.result) || 'requested';
      }
    } catch (e) { status = 'failed'; error = String(e && e.message || e); }
    finally { if (tab) { try { await chrome.tabs.remove(tab.id); } catch (e) { /* noop */ } } }
    report({ groupId: g.group_id, status, error });
    // Human-like spacing between joins so the account is not flagged.
    if (i < list.length - 1) await rzWait(20000 + Math.floor(Math.random() * 20000));
  }
  rzJoinCancelled.delete(requestId);
  report({ done: true });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'RZ_FB_GROUP_SEARCH') {
    rzSearchGroups(String(msg.query || '').slice(0, 120))
      .then((groups) => sendResponse({ ok: true, groups }))
      .catch((e) => sendResponse({ ok: false, error: String(e && e.message || e) }));
    return true;
  }
  if (msg.type === 'RZ_FB_GROUP_JOIN' && Array.isArray(msg.groups)) {
    rzJoinGroups(msg.requestId, msg.groups, sender && sender.tab ? sender.tab.id : null);
    sendResponse({ ok: true });
    return;
  }
  if (msg.type === 'RZ_FB_GROUP_JOIN_CANCEL') { rzJoinCancelled.add(msg.requestId); sendResponse({ ok: true }); }
});

/* ── Page post sync (replaces Graph /{page_id}/posts) ─────────────────────
 * Opens the connected Facebook Page in a background tab, scrolls the feed,
 * and reads posts + visible like/comment/share counters straight from the DOM.
 * Read-only: never clicks, reacts or comments. */
function rzScrapePagePosts() {
  const num = (raw) => {
    if (raw == null) return null;
    const m = String(raw).replace(/[,\s]/g, '').match(/^([\d.]+)(K|M|אלף|מיליון)?$/i);
    if (!m) return null;
    let n = parseFloat(m[1]);
    if (/K|אלף/i.test(m[2] || '')) n *= 1000;
    if (/M|מיליון/i.test(m[2] || '')) n *= 1000000;
    return Number.isFinite(n) ? Math.round(n) : null;
  };
  const idFrom = (h) => {
    const s = String(h || '');
    const m = s.match(/\/posts\/(pfbid[\w-]+|\d{5,})/) || s.match(/permalink\/(\d{5,})/) ||
      s.match(/story_fbid=(pfbid[\w-]+|\d{5,})/) || s.match(/\/videos\/(\d{5,})/) || s.match(/fbid=(\d{5,})/) ||
      s.match(/\/reel\/(\d{5,})/);
    return m ? m[1] : null;
  };
  const hash = (t) => { let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return 'h' + (h >>> 0).toString(36); };
  const NOISE = /(סמן סטטוס מקוון|פעיל\/ה|Active now|Turn on active status|אנשי קשר|Contacts|Sponsored|ממומן)/i;
  const clean = (t) => String(t || '').replace(/\uFFFD/g, '').replace(/[\u200B-\u200F\u202A-\u202E]/g, '').replace(/\n{3,}/g, '\n\n').trim();

  // Discover ALL post containers in the feed (querySelectorAll, not a single querySelector):
  // every top-level article / div[role=article] under [role=feed]; fall back to feed children,
  // then to top-level articles inside <main>.
  const isTop = (a) => !(a.parentElement && a.parentElement.closest('article, div[role="article"]'));
  const feeds = [...document.querySelectorAll('[role="feed"]')]
    .filter((f) => !f.closest('[role="complementary"], [role="navigation"], [role="banner"]'));
  let units = [];
  for (const f of feeds) {
    const arts = [...f.querySelectorAll('article, div[role="article"]')].filter(isTop);
    if (arts.length) units.push(...arts);
    else units.push(...[...f.children].map((c) => c.querySelector('article, div[role="article"]') || c));
  }
  if (!units.length) {
    const main = document.querySelector('[role="main"]') || document.body;
    units = [...main.querySelectorAll('article, div[role="article"]')].filter(isTop);
  }

  const out = new Map();
  for (const art of units) {
    if (!art || art.closest('[role="complementary"], [role="navigation"], [role="banner"], [role="dialog"]')) continue;
    // Drop comment articles nested in the post.
    const nested = [...art.querySelectorAll('article, div[role="article"]')];
    const msgNode = art.querySelector('[data-ad-preview="message"], [data-ad-comet-preview="message"]') ||
      [...art.querySelectorAll('div[dir="auto"]')].find((d) => !nested.some((n) => n.contains(d)) && (d.innerText || '').trim().length > 20);
    const message = clean(msgNode && msgNode.innerText).slice(0, 5000);
    const hrefs = [...art.querySelectorAll('a[href]')].filter((a) => !nested.some((n) => n.contains(a))).map((a) => a.href || '');
    const link = hrefs.find((h) => /\/posts\/|permalink|story_fbid=|\/videos\/|\/reel\/|photo\/?\?fbid=/.test(h)) || null;
    const media = [...new Set([...art.querySelectorAll('img')]
      .filter((i) => !nested.some((n) => n.contains(i)) && (i.naturalWidth || i.width || 0) >= 120)
      .map((i) => i.currentSrc || i.src)
      .filter((u) => u && /scontent|fbcdn/.test(u) && !/\/p\d+x\d+\/|emoji|rsrc\.php/.test(u)))].slice(0, 10);
    if (!message && !media.length) continue;
    if (!link && NOISE.test(message) && message.length < 80) continue;
    const id = idFrom(link) || hash(message + '|' + (media[0] || ''));
    if (out.has(id)) continue;

    // Counters: read only the post's own footer (outside nested comment articles).
    const labels = [...art.querySelectorAll('[aria-label]')].filter((n) => !nested.some((x) => x.contains(n)))
      .map((n) => n.getAttribute('aria-label') || '');
    const spans = [...art.querySelectorAll('span, div[role="button"]')].filter((n) => !nested.some((x) => x.contains(n)) && n.childElementCount === 0)
      .map((n) => (n.textContent || '').trim()).filter((t) => t && t.length < 40);
    const pick = (re, list) => { for (const t of list) { const m = t.match(re); if (m) { const v = num(m[1]); if (v != null) return v; } } return null; };
    const N = '([\\d.,]+\\s*(?:K|M|אלף|מיליון)?)';
    let likes = pick(new RegExp('(?:All reactions|כל רגשות|כל התגובות לפוסט)[:\\s]*' + N, 'i'), labels) ??
      pick(new RegExp('^' + N + '\\s*(?:reactions?|people reacted|לייקים|רגשות)', 'i'), labels);
    const comments = pick(new RegExp('^' + N + '\\s*(?:comments?|תגובות|תגובה)$', 'i'), spans) ?? pick(new RegExp(N + '\\s*(?:comments?|תגובות)', 'i'), labels);
    const shares = pick(new RegExp('^' + N + '\\s*(?:shares?|שיתופים|שיתוף)$', 'i'), spans) ?? pick(new RegExp(N + '\\s*(?:shares?|שיתופים)', 'i'), labels);

    // Native timestamp: read the EXACT date/time string Facebook shows in the
    // post header (e.g. "לפני 5 שעות", "Yesterday at 14:32", "3 באוקטובר").
    // It lives on the permalink <a> in the header (aria-label or its text).
    const timeLink = [...art.querySelectorAll('a[href]')]
      .filter((a) => !nested.some((n) => n.contains(a)))
      .find((a) => {
        const t = clean(a.getAttribute('aria-label') || a.innerText || '');
        return t && t.length < 60 && /\d|אתמול|Yesterday|Just now|עכשיו/i.test(t) &&
          /(לפני|ago|Yesterday|אתמול|Just now|עכשיו|AM|PM|בשעה|:|\d{4})/i.test(t);
      });
    const nativeTimeText = timeLink ? clean(timeLink.getAttribute('aria-label') || timeLink.innerText || '') : null;
    // Parse the native string into an absolute date so the DB gets the real
    // publication time instead of "now". Supports Hebrew + English relative
    // and absolute formats; falls back to data-utime when present.
    const parseNativeTime = (t) => {
      if (!t) return null;
      const now = Date.now();
      const rel = t.match(/(\d+)\s*(?:דקות|דקה|minutes?|mins?|hrs?|hours?|שעות|שעה|ימים|יום|days?|שבועות|שבוע|weeks?)/i);
      if (/(Just now|עכשיו|כרגע)/i.test(t)) return new Date(now).toISOString();
      if (rel) {
        const n = Number(rel[1]);
        const unit = rel[2] || rel[0];
        const ms = /דק|min/i.test(unit) ? 6e4 : /שע|hr|hour/i.test(unit) ? 36e5 :
          /יום|ימים|day/i.test(unit) ? 864e5 : /שבוע|week/i.test(unit) ? 6048e5 : 6e4;
        return new Date(now - n * ms).toISOString();
      }
      if (/(אתמול|Yesterday)/i.test(t)) {
        const hm = t.match(/(\d{1,2}):(\d{2})/);
        const d = new Date(now - 864e5);
        if (hm) d.setHours(Number(hm[1]), Number(hm[2]), 0, 0);
        return d.toISOString();
      }
      const d = Date.parse(t);
      return Number.isFinite(d) ? new Date(d).toISOString() : null;
    };
    const tEl = art.querySelector('abbr[data-utime], [data-utime]');
    const utime = tEl ? Number(tEl.getAttribute('data-utime')) : null;
    const created = parseNativeTime(nativeTimeText) || (utime ? new Date(utime * 1000).toISOString() : null);
    out.set(id, { post_id: id, message, url: link, created_time: created, created_time_text: nativeTimeText, media,
      likeCount: likes, commentCount: comments, shareCount: shares });
  }
  return [...out.values()];
}

async function rzScrapePage(pageId, max, budgetMs) {
  const url = pageId ? 'https://www.facebook.com/' + encodeURIComponent(pageId) : 'https://www.facebook.com/me';
  const tab = await rzOpenAndWait(url);
  // Budget starts once the feed is open, so loading time never eats scrape time
  // (the app's own overall timeout still caps the total sync).
  const deadline = Date.now() + Math.max(8000, Math.min(Number(budgetMs) || 17000, 60000));
  const all = new Map();
  const collect = async () => {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: rzScrapePagePosts });
    const batch = ((res && res.result) || []);
    for (const p of batch) all.set(p.post_id, p);
    return batch.length;
  };
  try {
    // Warm-up: incremental scrolls FIRST so multiple posts load into the DOM
    // before any extraction runs.
    for (let i = 0; i < 3 && Date.now() < deadline; i++) {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => window.scrollBy(0, 2200) });
      await rzWait(1500);
    }
    // Full-array extraction of everything currently in the DOM, then keep
    // scrolling + re-extracting until the 10-post quota or the deadline is hit.
    for (let i = 0; i < 8 && all.size < max && Date.now() < deadline; i++) {
      await collect();
      if (all.size >= max) break; // quota reached — stop scrolling
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => window.scrollBy(0, 2200) });
      await rzWait(1800);
    }
    if (all.size < max) await collect(); // final pass only if still short
  } finally { try { await chrome.tabs.remove(tab.id); } catch (e) { /* noop */ } }
  // Newest-first: feed order is already newest-first, keep only the recent 10.
  const posts = [...all.values()].slice(0, max);
  try { await chrome.storage.local.set({ rzPosts: posts, rzPostsAt: Date.now() }); } catch (e) { /* noop */ }
  return posts;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'RZ_FB_PAGE_SCRAPE') return;
  const pageId = msg.pageId ? String(msg.pageId).replace(/[^\w.-]/g, '').slice(0, 80) : null;
  rzScrapePage(pageId, Math.min(Number(msg.max) || 10, 10), msg.budgetMs)
    .then((posts) => sendResponse({ ok: true, posts }))
    .catch((e) => sendResponse({ ok: false, error: String(e && e.message || e), posts: [] }));
  return true;
});
