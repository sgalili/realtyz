/* Realtyz Group Sync — hands the collected groups, posts and comments to the
 * Realtyz app. */
(function () {
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

  const deliver = () => {
    chrome.storage.local.get(['rzGroups'], (res) => {
      const groups = res && res.rzGroups;
      if (!Array.isArray(groups) || groups.length === 0) return;
      try { localStorage.setItem(GROUPS_KEY, JSON.stringify(groups)); } catch (e) { /* noop */ }
      emit('RZ_FB_GROUPS', 'groups', groups, 'rz:ext-fb-groups');
    });
  };

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

  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || typeof d !== 'object') return;
    if (d.type === 'RZ_FB_GROUPS_REQUEST') deliver();
    if (d.type === 'RZ_FB_POSTS_REQUEST') deliverPosts();
    if (d.type === 'RZ_FB_COMMENTS_REQUEST') deliverComments(d.postIds);
  });
  /* ── Posting-runner bridge (pairing + status) ─────────────────────────── */
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || typeof d !== 'object' || d.source !== 'realtyz-app') return;

    if (d.type === 'RZ_EXT_PAIR' && typeof d.token === 'string') {
      chrome.runtime.sendMessage({ type: 'RZ_EXT_PAIR', token: d.token }, () => {
        chrome.runtime.sendMessage({ type: 'RZ_EXT_STATUS' }, (res) => {
          emit('RZ_EXT_STATUS', 'paired', !!(res && res.paired), 'rz:ext-status');
          try {
            window.postMessage({ source: 'realtyz-extension', type: 'RZ_EXT_STATUS', paired: !!(res && res.paired), state: (res && res.state) || {} }, window.location.origin);
          } catch (err) { /* noop */ }
        });
      });
    }

    if (d.type === 'RZ_EXT_STATUS_REQUEST') {
      chrome.runtime.sendMessage({ type: 'RZ_EXT_STATUS' }, (res) => {
        try {
          window.postMessage({ source: 'realtyz-extension', type: 'RZ_EXT_STATUS', paired: !!(res && res.paired), state: (res && res.state) || {} }, window.location.origin);
        } catch (err) { /* noop */ }
      });
    }

    if (d.type === 'RZ_EXT_POLL_NOW') chrome.runtime.sendMessage({ type: 'RZ_EXT_POLL_NOW' });
    if (d.type === 'RZ_EXT_UNPAIR') chrome.runtime.sendMessage({ type: 'RZ_EXT_UNPAIR' });
  });

  /* ── Instant local posting handed over by the app ─────────────────────── */
  const startPosting = (post) => {
    if (!post) return;
    chrome.runtime.sendMessage({ type: 'RZ_START_POSTING', post }, (res) => {
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

  document.addEventListener('rz:ext-fb-groups:request', deliver);
  document.addEventListener('rz:ext-fb-posts:request', deliverPosts);
  document.addEventListener('rz:ext-fb-comments:request', (e) => deliverComments(e?.detail?.postIds));
})();
