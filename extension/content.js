/* Realtyz Group Sync — hands the collected groups, posts and comments to the
 * Realtyz app. */
(function () {
  /* Safe runtime messaging: after the extension is reloaded/updated the old
   * content script keeps running with an invalidated context, and any
   * chrome.runtime.sendMessage call throws "Extension context invalidated". */
  const rzContextAlive = () => { try { return !!(chrome && chrome.runtime && chrome.runtime.id); } catch (e) { return false; } };
  const rzSafeSend = (msg, cb) => {
    const fail = (err) => {
      if (typeof cb !== 'function') return;
      try { cb({ ok: false, error: 'extension_context_invalidated', detail: String(err || '') }); } catch (e) { /* noop */ }
    };
    if (!rzContextAlive()) { fail('no runtime id'); return; }
    try {
      chrome.runtime.sendMessage(msg, (res) => {
        try { void chrome.runtime.lastError; } catch (e) { /* noop */ }
        if (typeof cb === 'function') { try { cb(res); } catch (e) { console.warn('[realtyz] message callback failed', e); } }
      });
    } catch (err) {
      console.warn('[realtyz] sendMessage failed', err && err.message);
      fail(err && err.message);
    }
  };

  const GROUPS_KEY = 'rz-ext-fb-groups';
  const INSTALLED_KEY = 'rz-ext-installed';

  const markInstalled = () => {
    try { localStorage.setItem(INSTALLED_KEY, '1'); } catch (e) { /* noop */ }
    try { document.documentElement.setAttribute('data-realtyz-extension', '1'); } catch (e) { /* noop */ }
  };

  const emit = (type, detailKey, value, eventName) => {
    try { window.postMessage({ source: 'realtyz-extension', type, [detailKey]: value }, window.location.origin); } catch (e) { /* noop */ }
    try { document.dispatchEvent(new CustomEvent(eventName, { detail: value })); } catch (e) { /* noop */ }
  };

  /* Mirror the scraped groups from chrome.storage.local into the page so the app
   * gets them through every channel (localStorage + postMessage + events).
   * Never clears a previously delivered list. */
  const deliver = () => {
    try {
      if (!chrome || !chrome.storage || !chrome.storage.local) return;
    } catch (e) { return; }
    try {
      chrome.storage.local.get(['rzGroups'], (res) => {
        try { if (chrome.runtime && chrome.runtime.lastError) return; } catch (e) { /* noop */ }
        const groups = res && res.rzGroups;
        if (!Array.isArray(groups) || groups.length === 0) return;
        const next = JSON.stringify(groups);
        let prev = null;
        try { prev = localStorage.getItem(GROUPS_KEY); } catch (e) { /* noop */ }
        if (prev !== next) {
          try { localStorage.setItem(GROUPS_KEY, next); } catch (e) { /* noop */ }
        }
        emit('RZ_FB_GROUPS', 'groups', groups, 'rz:ext-fb-groups');
        try { window.postMessage({ source: 'realtyz-extension', type: 'REALTYZ_SYNC_GROUPS', groups: groups }, '*'); } catch (e) { /* noop */ }
        try { window.dispatchEvent(new CustomEvent('rz:ext-fb-groups', { detail: groups })); } catch (e) { /* noop */ }
      });
    } catch (e) { /* noop */ }
  };

  /* Instant push the moment the Facebook tab scrapes new groups. */
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes && (changes.rzGroups || changes.rzGroupsAt)) deliver();
    });
  } catch (e) { /* noop */ }

  const deliverPosts = () => {
    chrome.storage.local.get(['rzPosts'], (res) => {
      const posts = (res && res.rzPosts) || [];
      emit('RZ_FB_POSTS', 'posts', posts, 'rz:ext-fb-posts');
    });
  };

  const deliverComments = (postIds) => {
    chrome.storage.local.get(['rzComments'], (res) => {
      let comments = (res && res.rzComments) || [];
      if (Array.isArray(postIds) && postIds.length) {
        const wanted = new Set(postIds.map(String));
        const filtered = comments.filter((c) => wanted.has(String(c.post_id)));
        if (filtered.length) comments = filtered;
      }
      emit('RZ_FB_COMMENTS', 'comments', comments, 'rz:ext-fb-comments');
    });
  };

  markInstalled();
  document.addEventListener('DOMContentLoaded', markInstalled);
  deliver();
  setInterval(deliver, 3000);

  const pendingPageResults = new Map();
  window.addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== window.location.origin) return;
    const d = e.data;
    if (!d || typeof d !== 'object' || d.source !== 'realtyz-app') return;
    if (d.type === 'RZ_FB_PAGE_SCRAPE_ACK') {
      const pending = pendingPageResults.get(d.requestId);
      if (!pending || pending.workspaceOwnerId !== d.workspaceOwnerId || pending.pageId !== d.pageId) return;
      rzSafeSend({ type: d.type, requestId: d.requestId, workspaceOwnerId: d.workspaceOwnerId, pageId: d.pageId }, (res) => {
        if (res && res.ok) { clearInterval(pending.timer); pendingPageResults.delete(d.requestId); }
      });
      return;
    }
    if (d.type === 'RZ_FB_GROUPS_REQUEST') deliver();
    if (d.type === 'RZ_FB_POSTS_REQUEST') {
      if (d.scrape) {
        const requestId = d.requestId;
        if (!requestId || !d.workspaceOwnerId || !d.pageId) return;
        rzSafeSend({ type: 'RZ_FB_PAGE_SCRAPE', requestId, workspaceOwnerId: d.workspaceOwnerId,
          pageId: d.pageId, max: d.max || 10, budgetMs: d.budgetMs || 17000 }, (res) => {
          const posts = (res && Array.isArray(res.posts)) ? res.posts : [];
          // Dedicated, request-correlated result so stale cached deliveries never answer a scrape.
          const result = { source: 'realtyz-extension', type: 'RZ_FB_PAGE_SCRAPE_RESULT', requestId,
            workspaceOwnerId: d.workspaceOwnerId, pageId: d.pageId,
            ok: !!(res && res.ok), posts, error: res && res.error };
          const deliverResult = () => { try { window.postMessage(result, window.location.origin); } catch (e) { /* noop */ } };
          if (result.ok) {
            const timer = setInterval(deliverResult, 1000);
            pendingPageResults.set(requestId, { workspaceOwnerId: d.workspaceOwnerId, pageId: d.pageId, timer });
            // Stop retries after two minutes, but NEVER close an unacknowledged Facebook tab.
            setTimeout(() => { clearInterval(timer); pendingPageResults.delete(requestId); }, 120000);
          }
          deliverResult();
        });
      } else deliverPosts();
    }
    if (d.type === 'RZ_FB_COMMENTS_REQUEST') deliverComments(d.postIds);
  });

  /* ── Group discovery (keyword search) + auto-join bridge ─────────────── */
  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || typeof d !== 'object' || d.source !== 'realtyz-app') return;
    if (d.type === 'RZ_FB_GROUP_SEARCH' && d.requestId) {
      rzSafeSend({ type: 'RZ_FB_GROUP_SEARCH', query: String(d.query || '') }, (res) => {
        window.postMessage({ source: 'realtyz-extension', type: 'RZ_FB_GROUP_SEARCH_RESULT', requestId: d.requestId,
          ok: !!(res && res.ok), groups: (res && res.groups) || [], error: res && res.error }, window.location.origin);
      });
    }
    if (d.type === 'RZ_FB_GROUP_JOIN' && d.requestId && Array.isArray(d.groups)) {
      rzSafeSend({ type: 'RZ_FB_GROUP_JOIN', requestId: d.requestId, groups: d.groups });
    }
    if (d.type === 'RZ_FB_GROUP_JOIN_CANCEL' && d.requestId) rzSafeSend({ type: 'RZ_FB_GROUP_JOIN_CANCEL', requestId: d.requestId });
  });
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'RZ_FB_GROUP_JOIN_PROGRESS') {
      window.postMessage({ source: 'realtyz-extension', ...msg }, window.location.origin);
    }
  });
  /* ── Posting-runner bridge (pairing + status) ─────────────────────────── */
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || typeof d !== 'object' || d.source !== 'realtyz-app') return;

    if (d.type === 'RZ_EXT_PAIR' && typeof d.token === 'string') {
      rzSafeSend({ type: 'RZ_EXT_PAIR', token: d.token }, () => {
        rzSafeSend({ type: 'RZ_EXT_STATUS' }, (res) => {
          emit('RZ_EXT_STATUS', 'paired', !!(res && res.paired), 'rz:ext-status');
          try {
            window.postMessage({ source: 'realtyz-extension', type: 'RZ_EXT_STATUS', paired: !!(res && res.paired), state: (res && res.state) || {} }, window.location.origin);
          } catch (err) { /* noop */ }
        });
      });
    }

    if (d.type === 'RZ_EXT_STATUS_REQUEST') {
      rzSafeSend({ type: 'RZ_EXT_STATUS' }, (res) => {
        try {
          window.postMessage({ source: 'realtyz-extension', type: 'RZ_EXT_STATUS', paired: !!(res && res.paired), state: (res && res.state) || {} }, window.location.origin);
        } catch (err) { /* noop */ }
      });
    }

    if (d.type === 'RZ_EXT_POLL_NOW') rzSafeSend({ type: 'RZ_EXT_POLL_NOW' });
    if (d.type === 'RZ_EXT_UNPAIR') rzSafeSend({ type: 'RZ_EXT_UNPAIR' });
    if (d.type === 'RZ_WORKSPACE_ACTIVATE' && typeof d.workspaceOwnerId === 'string') {
      rzSafeSend({ type: 'RZ_WORKSPACE_ACTIVATE', workspaceOwnerId: d.workspaceOwnerId });
    }
  });

  /* ── Instant local posting handed over by the app ─────────────────────── */
  const startPosting = (post) => {
    if (!post) return;
    rzSafeSend({ type: 'RZ_START_POSTING', post }, (res) => {
      const result = res || { ok: false, reason: 'התוסף לא החזיר תשובה' };
      try {
        window.postMessage({ source: 'realtyz-extension', type: 'RZ_POSTING_RESULT', result }, window.location.origin);
      } catch (err) { /* noop */ }
      try { document.dispatchEvent(new CustomEvent('rz:ext-posting-result', { detail: result })); } catch (err) { /* noop */ }
    });
  };

  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || typeof d !== 'object') return;
    if (d.type !== 'RZ_START_POSTING') return;
    let post = d.post || d.payload || null;
    if (!post) {
      try { post = JSON.parse(localStorage.getItem('rz-pending-post') || 'null'); } catch (err) { post = null; }
    }
    startPosting(post);
  });

  document.addEventListener('rz:ext-start-posting', (e) => {
    let post = e && e.detail;
    if (!post) {
      try { post = JSON.parse(localStorage.getItem('rz-pending-post') || 'null'); } catch (err) { post = null; }
    }
    startPosting(post);
  });

  /* ── Local post queue handed over by the app ─────────────────────────── */
  const readQueue = () => {
    try { return JSON.parse(localStorage.getItem('rzPostQueue') || '[]'); } catch (err) { return []; }
  };

  const writeQueue = (queue) => {
    if (!Array.isArray(queue)) return;
    try {
      const next = JSON.stringify(queue);
      if (localStorage.getItem('rzPostQueue') === next) return;
      localStorage.setItem('rzPostQueue', next);
    } catch (err) { return; }
    emit('RZ_QUEUE_UPDATE', 'queue', queue, 'rz:update-queue');
  };

  /* Fallback path: if the service worker is asleep or the message channel dies,
   * merge the app's queue straight into chrome.storage.local so the poster can
   * still pick the jobs up on its next storage poll. */
  const mergeIntoStorage = (queue) => {
    if (!Array.isArray(queue) || !queue.length) return;
    try {
      chrome.storage.local.get(['rzPostQueue'], (res) => {
        if (chrome.runtime.lastError) return;
        const existing = Array.isArray((res || {}).rzPostQueue) ? res.rzPostQueue : [];
        const byId = new Map(existing.map((e) => [String(e && e.id), e]));
        queue.forEach((entry) => {
          if (!entry || !entry.id) return;
          const key = String(entry.id);
          const hit = byId.get(key);
          // Never downgrade a job the extension already ran.
          if (hit && (hit.status === 'completed' || hit.status === 'posting')) return;
          byId.set(key, hit ? { ...hit, ...entry, status: hit.status || entry.status } : entry);
        });
        chrome.storage.local.set({ rzPostQueue: [...byId.values()] }, () => {
          if (chrome.runtime.lastError) return;
          try { rzSafeSend({ type: 'RZ_EXT_POLL_NOW' }, () => chrome.runtime.lastError); } catch (e) { /* noop */ }
        });
      });
    } catch (err) { /* noop */ }
  };

  const pushQueue = (queue) => {
    if (!Array.isArray(queue)) return;
    let answered = false;
    try {
      rzSafeSend({ type: 'RZ_QUEUE_UPDATE', queue }, (res) => {
        if (chrome.runtime.lastError) { mergeIntoStorage(queue); return; }
        answered = true;
        if (res && Array.isArray(res.queue)) writeQueue(res.queue);
      });
    } catch (err) {
      mergeIntoStorage(queue);
      return;
    }
    // Worker never answered (cold start / crashed) — write the queue ourselves.
    setTimeout(() => { if (!answered) mergeIntoStorage(queue); }, 2500);
  };

  document.addEventListener('rz:update-queue', (e) => {
    pushQueue((e && e.detail) || readQueue());
  });

  /* Push whatever the app already stored, right at injection time. Without this
   * a queue created before the content script loaded would never reach
   * chrome.storage.local and the poster would find nothing to run. */
  const pushPending = () => {
    const queue = readQueue();
    if (!queue.length) return;
    const pending = queue.filter((j) => j && (j.status === 'pending' || !j.status));
    if (!pending.length) return;
    pushQueue(queue);
  };

  pushPending();
  setInterval(pushPending, 5000);
  window.addEventListener('focus', pushPending);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pushPending(); });

  /* ── Live state mirror: chrome.storage.local -> page ─────────────────────
   * The extension runs the jobs in its own context, so the page would stay
   * stuck on "ממתין בתור". Mirror the authoritative queue (status + stage)
   * back into localStorage so the app's status pills update in real time. */
  const mirrorState = () => {
    try {
      chrome.storage.local.get(['rzPostQueue'], (res) => {
        if (chrome.runtime.lastError) return;
        const live = Array.isArray((res || {}).rzPostQueue) ? res.rzPostQueue : null;
        if (!live) return;
        const local = readQueue();
        const byId = new Map(local.map((e) => [String(e && e.id), e]));
        live.forEach((job) => {
          if (!job || !job.id) return;
          const key = String(job.id);
          const hit = byId.get(key);
          byId.set(key, hit ? { ...hit, status: job.status, stage: job.stage, stageAt: job.stageAt, error: job.error } : job);
        });
        writeQueue([...byId.values()]);
      });
    } catch (err) { /* noop */ }
  };

  setInterval(mirrorState, 1500);
  mirrorState();

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes || !changes.rzPostQueue) return;
      mirrorState();
    });
  } catch (err) { /* noop */ }

  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || typeof d !== 'object') return;
    // Both the internal name and the public REALTYZ_* broadcast are accepted.
    if (d.type !== 'RZ_QUEUE_UPDATE' && d.type !== 'REALTYZ_QUEUE_UPDATE') return;
    if (d.source === 'realtyz-extension') return; // our own echo
    const incoming = Array.isArray(d.queue) ? d.queue : readQueue();
    if (Array.isArray(d.queue)) writeQueue(d.queue);
    pushQueue(incoming);
  });

  // The app deleted posts — purge those jobs from the extension queue too.
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || typeof d !== 'object' || d.type !== 'RZ_QUEUE_REMOVE') return;
    if (d.source === 'realtyz-extension') return;
    try {
      rzSafeSend(
        { type: 'RZ_QUEUE_REMOVE', ids: d.ids || [], textKeys: d.textKeys || [] },
        (res) => {
          if (chrome.runtime.lastError) return;
          if (res && Array.isArray(res.queue)) writeQueue(res.queue);
        },
      );
    } catch (err) { /* noop */ }
  });

  // Pick up anything queued before the extension loaded.
  setTimeout(() => { const q = readQueue(); if (q.length) pushQueue(q); }, 1500);

  // Keep the app in sync with the extension's own queue state (status badges).
  const syncQueue = () => {
    try {
      rzSafeSend({ type: 'RZ_QUEUE_STATE_REQUEST' }, (res) => {
        if (chrome.runtime.lastError) return;
        const extQueue = res && Array.isArray(res.queue) ? res.queue : null;
        if (!extQueue) return;
        const local = readQueue();
        const byId = new Map(extQueue.map((e) => [String(e.id), e]));
        // Any local entry the extension has not seen yet gets handed over.
        const unseen = local.filter((e) => e && e.id && !byId.has(String(e.id)) && e.status === 'pending');
        if (unseen.length) pushQueue(local);
        writeQueue(local.map((e) => (e && byId.has(String(e.id)) ? byId.get(String(e.id)) : e)));
      });
    } catch (err) { /* noop */ }
  };
  setInterval(syncQueue, 1500);
  setTimeout(syncQueue, 2000);

  document.addEventListener('rz:ext-fb-groups:request', deliver);
  document.addEventListener('rz:ext-fb-posts:request', deliverPosts);
  document.addEventListener('rz:ext-fb-comments:request', (e) => deliverComments(e?.detail?.postIds));
})();

