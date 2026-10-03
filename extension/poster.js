/* Realtyz Group Sync — local posting automation.
 *
 * Runs inside facebook.com/groups/<id>. Opens the group composer, injects the
 * post text (React-safe), attaches media if provided, clicks "פרסם"/"Post" and
 * verifies the result from Facebook's own UI state. Every failure resolves with
 * a clear Hebrew reason so the queue never stays stuck.
 */
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

  // Static + programmatic injection may both run — load exactly once per page.
  if (window.__rzPosterLoaded) return;
  window.__rzPosterLoaded = true;
  /* Live stage feedback so the web app can render a real progress bar. */
  let currentJobId = null;
  const reportStage = (stage) => {
    if (!currentJobId) return;
    try {
      rzSafeSend({ type: 'RZ_JOB_STAGE', jobId: currentJobId, stage }, () => chrome.runtime.lastError);
    } catch (e) { /* noop */ }
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const visible = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const textOf = (el) => (el ? (el.innerText || el.textContent || '').trim() : '');

  const waitFor = async (fn, timeoutMs = 20000, step = 400) => {
    const started = Date.now();
    for (;;) {
      let hit = null;
      try { hit = fn(); } catch (e) { hit = null; }
      if (hit) return hit;
      if (Date.now() - started > timeoutMs) return null;
      await sleep(step);
    }
  };

  // MutationObserver + polling hybrid: resolves as soon as the DOM produces a match.
  const waitForDom = (fn, timeoutMs = 15000, step = 400) => new Promise((resolve) => {
    let done = false; let obs = null; let iv = null; let to = null;
    const finish = (v) => { if (done) return; done = true; try { obs && obs.disconnect(); } catch (e) {} clearInterval(iv); clearTimeout(to); resolve(v); };
    const check = () => { let hit = null; try { hit = fn(); } catch (e) { hit = null; } if (hit) finish(hit); };
    check(); if (done) return;
    try { obs = new MutationObserver(check); obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true }); } catch (e) {}
    iv = setInterval(check, step);
    to = setTimeout(() => finish(null), timeoutMs);
  });

  const LOGIN_RE = /log in|התחבר|כניסה לחשבון/i;
  const isLoggedOut = () =>
    !!document.querySelector('form[action*="login"] input[name="pass"]') ||
    (/\/login|\/checkpoint/.test(location.pathname) && LOGIN_RE.test(document.body?.innerText || ''));

  const buttons = () => [
    ...document.querySelectorAll('div[role="button"], span[role="button"], a[role="button"], button'),
  ];

  const findByText = (re, root) =>
    (root ? [...root.querySelectorAll('div[role="button"], span[role="button"], button')] : buttons())
      .filter(visible)
      .find((b) => re.test(textOf(b)) || re.test(b.getAttribute('aria-label') || ''));

  const COMPOSER_RE = /מה עולה בראשך|מה עולה לך בראש|כתוב משהו|כתבי משהו|כתבו משהו|מה בא לך לשתף|Write something|What's on your mind|Anything on your mind|Create a public post/i;
  const COMMENT_RE = /comment|reply|תגוב|הגב/i;

  // The main group composer trigger lives outside any article (posts/comments).
  const composerTrigger = () =>
    [...document.querySelectorAll('div[role="button"], span[role="button"], [role="button"] span')]
      .filter(visible)
      .filter((b) => !b.closest('div[role="article"]') && !b.closest('div[role="dialog"]'))
      .find((b) => COMPOSER_RE.test(textOf(b)) || COMPOSER_RE.test(b.getAttribute('aria-label') || '')) || null;

  // Post-creation modal: a dialog that contains a non-comment textbox.
  const isCommentBox = (el) =>
    !!el.closest('div[role="article"]') ||
    COMMENT_RE.test(el.getAttribute('aria-label') || '') ||
    COMMENT_RE.test(el.getAttribute('aria-placeholder') || '');

  const composerBoxIn = (d) =>
    [...d.querySelectorAll('div[role="textbox"][contenteditable="true"], div[contenteditable="true"][aria-label]')]
      .filter(visible)
      .find((el) => !isCommentBox(el)) || null;

  const dialog = () =>
    [...document.querySelectorAll('div[role="dialog"]')].filter(visible).find((d) => composerBoxIn(d)) || null;

  // Only ever inject into the dedicated post-creation modal, never the page/comment boxes.
  const textbox = () => {
    const d = dialog();
    return d ? composerBoxIn(d) : null;
  };

  const postButton = () => {
    const scope = dialog();
    if (!scope) return null;
    return [...scope.querySelectorAll('div[role="button"], button')]
      .filter(visible)
      .find((b) => {
        const label = `${textOf(b)} ${b.getAttribute('aria-label') || ''}`.trim();
        return /^(פרסם|פרסמי|פוסט|Post)$/i.test(textOf(b)) || /^(פרסם|Post)$/i.test(label);
      }) || null;
  };

  const shiftEnter = (box) => {
    const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, shiftKey: true, bubbles: true, cancelable: true };
    box.dispatchEvent(new KeyboardEvent('keydown', opts));
    let ok = false;
    try { ok = document.execCommand('insertLineBreak'); } catch (e) { ok = false; }
    if (!ok) { try { document.execCommand('insertParagraph'); } catch (e) { /* noop */ } }
    box.dispatchEvent(new KeyboardEvent('keyup', opts));
  };

  /* React-safe text insertion, line by line so breaks/emojis/bullets survive */
  const injectText = async (box, text) => {
    box.focus();
    box.click();
    await sleep(250);
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    let ok = true;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]) {
        let hit = false;
        try { hit = document.execCommand('insertText', false, lines[i]); } catch (e) { hit = false; }
        if (!hit) ok = false;
      }
      if (i < lines.length - 1) shiftEnter(box);
      await sleep(30);
    }
    if (!ok) {
      box.textContent = '';
      // Fallback: clipboard-less paste event
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      box.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }
    box.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await sleep(600);
    return textOf(box).length > 0;
  };

  // Attach every property photo (Facebook allows many; we cap at 10) in one go.
  const attachImages = async (urls) => {
    const list = [...new Set((urls || []).filter(Boolean))].slice(0, 10);
    if (!list.length) return null;
    const scope = dialog() || document;
    const input = [...scope.querySelectorAll('input[type="file"]')].find(
      (i) => !i.disabled && /image|video|\*/.test(i.getAttribute('accept') || '*'),
    );
    if (!input) return 'לא נמצא שדה העלאת תמונה בעורך הפוסט';
    const dt = new DataTransfer();
    for (let i = 0; i < list.length; i++) {
      try {
        const res = await fetch(list[i], { mode: 'cors' });
        if (!res.ok) continue;
        const blob = await res.blob();
        const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
        dt.items.add(new File([blob], `realtyz-${i + 1}.${ext}`, { type: blob.type || 'image/jpeg' }));
      } catch (e) { /* skip this photo */ }
    }
    if (!dt.files.length) return 'הורדת התמונות לפרסום נכשלה';
    if (!input.multiple && dt.files.length > 1) input.multiple = true;
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    const want = dt.files.length;
    await waitFor(() => {
      const n = (dialog() || document).querySelectorAll('img[src^="blob:"]').length;
      return n >= want ? true : null;
    }, 25000 + want * 3000);
    return null;
  };

  /* Type + submit the first comment on the freshly published post.
     Resolves with null on success or a Hebrew reason on failure. */
  const addFirstComment = async (article, snippet, text) => {
    let art = article;
    if (!art) {
      art = await waitFor(() => {
        const hit = [...document.querySelectorAll('div[role="article"]')].find((a) =>
          (a.innerText || '').replace(/\s+/g, ' ').includes(snippet),
        );
        return hit || null;
      }, 20000, 800);
    }
    if (!art) return 'הפוסט לא נמצא בפיד להוספת תגובה ראשונה';

    // Open the comment box: either it already exists, or the "Comment" action opens it.
    const commentBox = () =>
      [...art.querySelectorAll('div[role="textbox"][contenteditable="true"]')].filter(visible)[0] || null;

    let box = commentBox();
    if (!box) {
      const trigger = findByText(/^(הגב|תגובה|כתוב תגובה|Comment|Write a comment)/i, art);
      if (trigger) {
        trigger.click();
        box = await waitFor(commentBox, 12000, 400);
      }
    }
    if (!box) return 'שדה התגובה לא נפתח';

    const injected = await injectText(box, text);
    if (!injected) return 'הזנת התגובה הראשונה נכשלה';

    // Submit: Enter is the native way to publish a Facebook comment.
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    box.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    box.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));

    const cleared = await waitFor(() => (textOf(commentBox()) ? null : true), 15000, 700);
    if (!cleared) {
      const send = findByText(/^(שלח|פרסם תגובה|Post|Send)$/i, art);
      if (send) {
        send.click();
        const cleared2 = await waitFor(() => (textOf(commentBox()) ? null : true), 12000, 700);
        if (!cleared2) return 'התגובה הראשונה לא נשלחה';
      } else {
        return 'התגובה הראשונה לא נשלחה';
      }
    }
    return null;
  };



  /* ── Execution guards ────────────────────────────────────────────────────
   * Nothing here may ever fire on its own. Every action requires an explicit
   * job from the app (with an id), and the current URL must be a legitimate
   * target: a group for posting, a real post permalink for commenting.
   * The personal newsfeed, personal profile, watch and marketplace are hard
   * blocked so the automation can never loop over private content. */
  const BLOCKED_CONTEXT = /^\/(?:$|\?|home|profile\.php|me\/?$|watch|marketplace|reels|stories|messages|notifications|friends|bookmarks|settings|gaming)/i;
  const GROUP_CONTEXT = /^\/groups\/[^/]+/i;
  const POST_CONTEXT = /(?:\/posts\/|\/permalink|permalink\.php|story_fbid=|multi_permalinks=|pfbid|\/photo|\/videos\/|comment_id=)/i;

  const contextOf = () => `${location.pathname}${location.search}`;

  const groupContextOk = () => GROUP_CONTEXT.test(location.pathname) && !BLOCKED_CONTEXT.test(location.pathname);
  const postContextOk = () => POST_CONTEXT.test(contextOf()) && !BLOCKED_CONTEXT.test(location.pathname);

  /* One run per job id inside this tab, forever. */
  const doneJobs = new Set();
  const claimJob = (job) => {
    const id = String((job && job.id) || '').trim();
    if (!id) return null;
    if (doneJobs.has(id)) return null;
    doneJobs.add(id);
    return id;
  };

  async function postToGroup(job) {
    if (isLoggedOut()) return { ok: false, reason: 'נדרשת התחברות לפייסבוק בדפדפן' };
    if (!groupContextOk()) {
      return { ok: false, reason: 'הפעולה בוטלה: העמוד הפתוח אינו קבוצת פייסבוק' };
    }

    // 0. wait for the group feed to be fully rendered before touching anything
    const feedReady = await waitForDom(() => (
      document.querySelector('div[role="feed"]') || composerTrigger() || textbox()
    ) ? true : null, 30000, 500);
    if (!feedReady) return { ok: false, reason: 'פיד הקבוצה לא נטען — לא נמצאה תיבת הפרסום' };
    await sleep(1200);

    // 1. open the composer
    let box = textbox();
    if (!box) {
      const trigger = await waitForDom(composerTrigger, 15000);
      if (!trigger) return { ok: false, reason: 'לא נמצא "מה עולה בראשך?" בקבוצה תוך 15 שניות (אין הרשאת פרסום או שהעמוד לא נטען)' };
      trigger.scrollIntoView({ block: 'center' });
      trigger.click();
      box = await waitForDom(textbox, 15000);
      if (!box) {
        // one retry: Facebook sometimes swallows the first click while hydrating
        const again = composerTrigger();
        if (again) { again.click(); box = await waitForDom(textbox, 10000); }
      }
    }
    if (!box) return { ok: false, reason: 'עורך הפוסט לא נפתח' };

    // 2. text
    reportStage('writing');
    const injected = await injectText(box, String(job.message || ''));
    if (!injected) return { ok: false, reason: 'הזנת תוכן הפוסט נכשלה' };
    // let Facebook's React state register the input before validating / submitting
    await sleep(1200);
    // Verify the text landed in the group post modal (never a comment box).
    const firstLine = String(job.message || '').split('\n').map((l) => l.trim()).find(Boolean) || '';
    const probe = firstLine.replace(/\s+/g, ' ').slice(0, 25);
    const liveBox = textbox();
    if (!liveBox || isCommentBox(liveBox) || (probe && !textOf(liveBox).replace(/\s+/g, ' ').includes(probe))) {
      return { ok: false, reason: 'הטקסט לא הוזן לחלון הפוסט של הקבוצה' };
    }

    // 3. media
    const photoList = Array.isArray(job.image_urls) && job.image_urls.length ? job.image_urls : (job.image_url ? [job.image_url] : []);
    if (photoList.length) {
      const mediaErr = await attachImages(photoList);
      if (mediaErr) return { ok: false, reason: mediaErr };
    }

    // 4. post
    const btn = await waitFor(() => {
      const b = postButton();
      if (!b) return null;
      const disabled = b.getAttribute('aria-disabled') === 'true' || b.getAttribute('disabled') !== null;
      return disabled ? null : b;
    }, 20000);
    if (!btn) return { ok: false, reason: 'כפתור הפרסום לא היה זמין' };
    btn.click();
    const submitted = true;

    // 5. verify: the composer dialog closes and the text shows up in the feed
    const snippet = String(job.message || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    const closed = await waitFor(() => (dialog() ? null : true), 60000, 700);
    if (!closed) {
      const err = [...document.querySelectorAll('div[role="alert"], div[role="dialog"] span')]
        .map(textOf)
        .find((t) => /שגיאה|נכשל|error|try again|לא ניתן/i.test(t));
      return { ok: false, reason: err ? err.slice(0, 200) : 'הפרסום לא הושלם — חלון העורך נשאר פתוח' };
    }

    const seen = await waitFor(() => {
      const body = document.body ? document.body.innerText.replace(/\s+/g, ' ') : '';
      return snippet && body.includes(snippet) ? true : null;
    }, 25000, 1000);

    const pendingApproval = !seen && /ממתין לאישור|ממתינים לאישור|pending approval|submitted for approval|awaiting approval/i
      .test(document.body ? document.body.innerText : '');
    if (!seen && !pendingApproval) {
      return { ok: false, submitted, reason: 'נלחץ "פרסם" אך הפוסט לא הופיע בקבוצה — לא אומת' };
    }

    let postUrl = null;
    let article = null;
    if (seen) {
      article = [...document.querySelectorAll('div[role="article"]')].find((a) =>
        (a.innerText || '').replace(/\s+/g, ' ').includes(snippet),
      ) || null;
      const href = article
        ? [...article.querySelectorAll('a[href]')].map((a) => a.getAttribute('href') || '').find((h) => /\/posts\/|permalink|multi_permalinks/.test(h))
        : null;
      if (href) postUrl = href.startsWith('http') ? href : `https://www.facebook.com${href}`;
    }

    // 6. first comment (contact details / link) right after the post went live
    const firstComment = String(job.first_comment || job.firstComment || '').trim();
    let commentError = null;
    if (firstComment) {
      reportStage('commenting');
      commentError = await addFirstComment(article, snippet, firstComment);
    }

    // Only reached after: modal text verified, "פרסם" clicked, dialog closed,
    // and the post is visible in the feed (or awaiting admin approval).
    return {
      ok: true,
      submitted,
      pending_approval: pendingApproval,
      post_url: postUrl,
      verified_in_feed: true,
      first_comment_ok: firstComment ? !commentError : null,
      first_comment_error: commentError || null,
    };
  }

  async function postFirstCommentToPage(job) {
    if (isLoggedOut()) return { ok: false, reason: 'נדרשת התחברות לפייסבוק בדפדפן' };
    if (!postContextOk() && !groupContextOk()) {
      return { ok: false, reason: 'הפעולה בוטלה: העמוד הפתוח אינו פוסט ספציפי' };
    }

    const postUrl = String(job.post_url || '').trim();
    const postId = String(job.post_id || '').trim();
    const message = String(job.message || '').trim();
    if (!message) return { ok: false, reason: 'תוכן התגובה הראשונה ריק' };
    // Graph ids look like "<pageId>_<postId>" while links carry only one part.
    const idParts = postId.split('_').filter((x) => x && x.length > 5);

    // Try to locate the post article by permalink or post id.
    let article = await waitFor(() => {
      const articles = [...document.querySelectorAll('div[role="article"]')];
      if (postUrl) {
        const byHref = articles.find((a) =>
          [...a.querySelectorAll('a[href]')].some((x) => {
            const h = x.getAttribute('href') || '';
            return h === postUrl || h.includes(postUrl.replace(/^https:\/\/www\.facebook\.com\//, ''));
          }),
        );
        if (byHref) return byHref;
      }
      if (postId) {
        const byId = articles.find((a) =>
          [...a.querySelectorAll('a[href]')].some((x) => {
            const h = x.getAttribute('href') || '';
            return idParts.some((part) => h.includes(part));
          }),
        );
        if (byId) return byId;
      }
      return null;
    }, 25000, 800);

    if (!article) {
      // Fallback: scroll once to load more feed items.
      window.scrollBy({ top: 800, behavior: 'smooth' });
      await sleep(1500);
      article = await waitFor(() => {
        const articles = [...document.querySelectorAll('div[role="article"]')];
        if (postUrl) {
          return articles.find((a) =>
            [...a.querySelectorAll('a[href]')].some((x) => {
              const h = x.getAttribute('href') || '';
              return h === postUrl || h.includes(postUrl.replace(/^https:\/\/www\.facebook\.com\//, ''));
            }),
          ) || null;
        }
        if (postId) {
          return articles.find((a) =>
            [...a.querySelectorAll('a[href]')].some((x) => idParts.some((part) => (x.getAttribute('href') || '').includes(part))),
          ) || null;
        }
        return null;
      }, 15000, 800);
    }

    if (!article) {
      // Permalink pages render exactly one post — take the largest visible
      // article that already carries a comment affordance.
      const candidates = [...document.querySelectorAll('div[role="article"]')].filter(visible);
      article =
        candidates.find((a) =>
          a.querySelector('div[role="textbox"][contenteditable="true"]') ||
          findByText(/^(הגב|תגובה|כתוב תגובה|Comment|Write a comment)/i, a),
        ) || candidates[0] || null;
    }

    if (!article) return { ok: false, reason: 'הפוסט לא נמצא בעמוד — נסו לרענן את העמוד' };

    const err = await addFirstComment(article, '', message);
    if (err) return { ok: false, reason: err };
    return { ok: true, post_url: postUrl };
  }


  /* Final completion signal back to the background worker. Only this message
   * lets it close the tab and move on to the next queue item. */
  const signalDone = (jobId, res) => {
    const result = res || { ok: false, reason: 'לא התקבלה תוצאה' };
    const type = result.ok === true ? 'POST_SUCCESS' : 'POST_FAILED';
    const send = (attempt) => {
      try {
        rzSafeSend({ type, jobId, result }, () => {
          if (chrome.runtime.lastError && attempt < 5) setTimeout(() => send(attempt + 1), 1000);
        });
      } catch (e) { if (attempt < 5) setTimeout(() => send(attempt + 1), 1000); }
    };
    send(0);
  };

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.source !== 'realtyz-extension') return;
    if (msg.type === 'RZ_POSTER_PING') { sendResponse({ alive: true }); return; }
    if (msg.type !== 'RZ_POST_TO_GROUP' && msg.type !== 'RZ_POST_FIRST_COMMENT') return;
    const claimed = claimJob(msg.job);
    if (!claimed) {
      sendResponse({ accepted: false, ok: false, reason: 'הפעולה בוטלה: אין מזהה עבודה תקף או שהעבודה כבר בוצעה' });
      return;
    }
    currentJobId = claimed;
    const jobId = String((msg.job && msg.job.id) || claimed);
    // ACK immediately; the real outcome arrives later via POST_SUCCESS/POST_FAILED.
    sendResponse({ accepted: true, jobId });
    const run = msg.type === 'RZ_POST_TO_GROUP'
      ? postToGroup(msg.job || {})
      : (reportStage('commenting'), postFirstCommentToPage(msg.job || {}));
    run
      .then((res) => signalDone(jobId, res))
      .catch((e) => signalDone(jobId, { ok: false, reason: String((e && e.message) || e) }));
  });
})();

/* ── App queue bridge ──────────────────────────────────────────────────────
 * The app broadcasts REALTYZ_QUEUE_UPDATE on its own tab. If this script ever
 * runs on a page that receives it (or the app is embedded), sync the jobs into
 * chrome.storage.local directly so the queue is never lost. */
window.addEventListener('message', (e) => {
  const d = e && e.data;
  if (!d || typeof d !== 'object') return;
  if (d.type !== 'REALTYZ_QUEUE_UPDATE' && d.type !== 'RZ_QUEUE_UPDATE') return;
  if (d.source === 'realtyz-extension') return;
  const queue = Array.isArray(d.queue) ? d.queue : null;
  if (!queue || !queue.length) return;
  try {
    chrome.storage.local.get(['rzPostQueue'], (res) => {
      if (chrome.runtime.lastError) return;
      const existing = Array.isArray((res || {}).rzPostQueue) ? res.rzPostQueue : [];
      const byId = new Map(existing.map((x) => [String(x && x.id), x]));
      queue.forEach((entry) => {
        if (!entry || !entry.id) return;
        const hit = byId.get(String(entry.id));
        if (hit && (hit.status === 'completed' || hit.status === 'posting')) return;
        byId.set(String(entry.id), hit ? { ...hit, ...entry, status: hit.status || entry.status } : entry);
      });
      chrome.storage.local.set({ rzPostQueue: [...byId.values()] }, () => chrome.runtime.lastError);
    });
  } catch (err) { /* noop */ }
});
