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

const sendToTab = (tabId, payload, timeoutMs) =>
  new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ ok: false, reason: 'תם הזמן להרצת הפרסום בדפדפן' });
    }, timeoutMs);
    try {
      chrome.tabs.sendMessage(tabId, payload, (res) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (chrome.runtime.lastError) {
          return resolve({ ok: false, reason: 'לא ניתן להריץ את הפרסום בעמוד הקבוצה' });
        }
        resolve(res || { ok: false, reason: 'לא התקבלה תשובה מעמוד הקבוצה' });
      });
    } catch (e) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, reason: String((e && e.message) || e) });
    }
  });

const groupUrl = (job) => {
  const raw = String(job.group_url || '').trim();
  if (/^https?:\/\/(www\.)?facebook\.com\/groups\//i.test(raw)) return raw.split('?')[0];
  const id = String(job.group_id || '').trim();
  return id ? `https://www.facebook.com/groups/${id}` : null;
};

/* ── one job ────────────────────────────────────────────────────────────── */

async function runJob(token, job) {
  const url = groupUrl(job);
  if (!url) return report(token, job, false, 'כתובת הקבוצה חסרה');
  if (!String(job.message || '').trim()) return report(token, job, false, 'תוכן הפוסט ריק');

  let tabId = null;
  try {
    const tab = await chrome.tabs.create({ url, active: false });
    tabId = tab.id;
    const loaded = await waitForTabLoad(tabId);
    if (!loaded) {
      await report(token, job, false, 'עמוד הקבוצה לא נטען בזמן');
      return;
    }
    await sleep(2500); // let Facebook hydrate the feed

    const result = await sendToTab(
      tabId,
      {
        source: 'realtyz-extension',
        type: 'RZ_POST_TO_GROUP',
        job: {
          id: job.id,
          message: job.message,
          image_url: job.image_url || null,
          first_comment: job.first_comment || null,
          link: job.link || null,
        },
      },
      JOB_TIMEOUT_MS,
    );

    await report(token, job, result.ok === true, result.reason || null, result.post_url || null);
    return result.ok === true;
  } catch (e) {
    await report(token, job, false, String((e && e.message) || e));
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

  let tabId = null;
  try {
    const tab = await chrome.tabs.create({ url: postUrl, active: false });
    tabId = tab.id;
    const loaded = await waitForTabLoad(tabId);
    if (!loaded) {
      await report(token, { id: entry.id, local: true }, false, 'עמוד הפוסט לא נטען בזמן');
      return false;
    }
    await sleep(2500);

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
        first_comment: post.firstComment || post.first_comment || null,
        link: post.link || null,
      });
      if (ok) done += 1;
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

async function mergeQueue(incoming) {
  const current = await loadQueue();
  const byId = new Map(current.map((e) => [String(e.id), e]));
  for (const e of incoming || []) {
    if (!e || !e.id) continue;
    if (!byId.has(String(e.id))) byId.set(String(e.id), e);
  }
  const merged = Array.from(byId.values());
  await saveQueue(merged);
  return merged;
}

const STALE_POSTING_MS = 6 * 60 * 1000;

async function drainQueue() {
  if (queueRunning) return;
  queueRunning = true;
  try {
    const token = await getToken();
    let queue = await loadQueue();
    // Recover jobs left "posting" by a killed service worker so nothing hangs.
    let recovered = false;
    for (const e of queue) {
      if (e && e.status === 'posting' && Date.now() - Number(e.startedAt || e.createdAt || 0) > STALE_POSTING_MS) {
        e.status = 'pending';
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
      if (Number(entry.scheduledTime || 0) > Date.now()) continue;

      entry.status = 'posting';
      entry.startedAt = Date.now();
      await saveQueue(queue);

      let ok = false;
      let reason = null;
      if (entry.type === 'page_first_comment' || entry.postId || entry.postUrl) {
        ok = await runPageFirstComment(token, entry);
      } else {
        ok = await runJob(token, {
          id: `queue-${entry.id}`,
          local: true,
          group_id: '',
          group_url: entry.groupUrl,
          message: String(entry.text || ''),
          image_url: (Array.isArray(entry.images) && entry.images[0]) || null,
          first_comment: entry.firstComment || null,
          link: entry.link || null,
        });
      }
      entry.status = ok ? 'completed' : 'failed';
      queue = await loadQueue().then((fresh) => {
        const hit = fresh.find((e) => String(e.id) === String(entry.id));
        if (hit) { hit.status = entry.status; hit.startedAt = null; hit.finishedAt = Date.now(); }
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
