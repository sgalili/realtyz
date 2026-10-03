/* Realtyz Group Sync — background worker.
 *
 * Every 60 seconds (while the browser is open) it asks the Realtyz backend for
 * Facebook group posts that are due, opens the group in a background tab,
 * runs the local posting automation (poster.js) and reports the outcome back.
 */

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

const waitForTabLoad = (tabId, timeoutMs = 45000) =>
  new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError || !tab) return resolve(false);
        if (tab.status === 'complete') return resolve(true);
        if (Date.now() - started > timeoutMs) return resolve(false);
        setTimeout(tick, 500);
      });
    };
    tick();
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
      JOB_TIMEOUT_MS,
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
      JOB_TIMEOUT_MS,
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

chrome.alarms.create(ALARM, { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === ALARM) poll(); });
chrome.runtime.onInstalled.addListener(() => { chrome.alarms.create(ALARM, { periodInMinutes: 1 }); poll(); });
chrome.runtime.onStartup.addListener(() => poll());

/* ── messages from the app page (content.js) ────────────────────────────── */

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
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
});
