/* Realtyz Group Sync — local posting automation.
 *
 * Runs inside facebook.com/groups/<id>. Opens the group composer, injects the
 * post text (React-safe), attaches media if provided, clicks "פרסם"/"Post" and
 * verifies the result from Facebook's own UI state. Every failure resolves with
 * a clear Hebrew reason so the queue never stays stuck.
 */
(function () {
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

  const composerTrigger = () =>
    findByText(/כתוב משהו|כתבו משהו|מה בא לך לשתף|Write something|Anything on your mind|Create a public post/i);

  const dialog = () => document.querySelector('div[role="dialog"]');

  const textbox = () => {
    const scope = dialog() || document;
    return [...scope.querySelectorAll('div[role="textbox"][contenteditable="true"], div[contenteditable="true"][aria-label]')]
      .filter(visible)[0] || null;
  };

  const postButton = () => {
    const scope = dialog() || document;
    return [...scope.querySelectorAll('div[role="button"], button')]
      .filter(visible)
      .find((b) => {
        const label = `${textOf(b)} ${b.getAttribute('aria-label') || ''}`.trim();
        return /^(פרסם|פרסמי|פוסט|Post)$/i.test(textOf(b)) || /^(פרסם|Post)$/i.test(label);
      }) || null;
  };

  /* React-safe text insertion */
  const injectText = async (box, text) => {
    box.focus();
    box.click();
    await sleep(250);
    let ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch (e) { ok = false; }
    if (!ok) {
      // Fallback: clipboard-less paste event
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      box.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }
    box.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await sleep(600);
    return textOf(box).length > 0;
  };

  const attachImage = async (url) => {
    const scope = dialog() || document;
    const input = [...scope.querySelectorAll('input[type="file"]')].find(
      (i) => !i.disabled && /image|video|\*/.test(i.getAttribute('accept') || '*'),
    );
    if (!input) return 'לא נמצא שדה העלאת תמונה בעורך הפוסט';
    let blob;
    try {
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) return `הורדת התמונה נכשלה (${res.status})`;
      blob = await res.blob();
    } catch (e) {
      return 'הורדת התמונה לפרסום נכשלה';
    }
    const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const file = new File([blob], `realtyz.${ext}`, { type: blob.type || 'image/jpeg' });
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    // Wait for the thumbnail to render inside the composer
    await waitFor(() => (dialog() || document).querySelector('div[role="dialog"] img[src^="blob:"], img[src^="blob:"]'), 25000);
    return null;
  };

  async function postToGroup(job) {
    if (isLoggedOut()) return { ok: false, reason: 'נדרשת התחברות לפייסבוק בדפדפן' };

    // 1. open the composer
    let box = textbox();
    if (!box) {
      const trigger = await waitFor(composerTrigger, 20000);
      if (!trigger) return { ok: false, reason: 'לא נמצא עורך הפוסטים בקבוצה (אין הרשאת פרסום או שהעמוד לא נטען)' };
      trigger.click();
      box = await waitFor(textbox, 20000);
    }
    if (!box) return { ok: false, reason: 'עורך הפוסט לא נפתח' };

    // 2. text
    const injected = await injectText(box, String(job.message || ''));
    if (!injected) return { ok: false, reason: 'הזנת תוכן הפוסט נכשלה' };

    // 3. media
    if (job.image_url) {
      const mediaErr = await attachImage(job.image_url);
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

    let postUrl = null;
    if (seen) {
      const art = [...document.querySelectorAll('div[role="article"]')].find((a) =>
        (a.innerText || '').replace(/\s+/g, ' ').includes(snippet),
      );
      const href = art
        ? [...art.querySelectorAll('a[href]')].map((a) => a.getAttribute('href') || '').find((h) => /\/posts\/|permalink|multi_permalinks/.test(h))
        : null;
      if (href) postUrl = href.startsWith('http') ? href : `https://www.facebook.com${href}`;
    }

    // Dialog closed with no visible error → Facebook accepted the post.
    return { ok: true, post_url: postUrl, verified_in_feed: !!seen };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.source !== 'realtyz-extension' || msg.type !== 'RZ_POST_TO_GROUP') return;
    postToGroup(msg.job || {})
      .then((res) => sendResponse(res))
      .catch((e) => sendResponse({ ok: false, reason: String((e && e.message) || e) }));
    return true;
  });
})();
