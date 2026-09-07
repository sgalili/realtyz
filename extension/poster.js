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
      commentError = await addFirstComment(article, snippet, firstComment);
    }

    // Dialog closed with no visible error → Facebook accepted the post.
    return {
      ok: true,
      post_url: postUrl,
      verified_in_feed: !!seen,
      first_comment_ok: firstComment ? !commentError : null,
      first_comment_error: commentError || null,
    };
  }

  async function postFirstCommentToPage(job) {
    if (isLoggedOut()) return { ok: false, reason: 'נדרשת התחברות לפייסבוק בדפדפן' };

    const postUrl = String(job.post_url || '').trim();
    const postId = String(job.post_id || '').trim();
    const message = String(job.message || '').trim();
    if (!message) return { ok: false, reason: 'תוכן התגובה הראשונה ריק' };

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
            return h.includes(postId);
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
            [...a.querySelectorAll('a[href]')].some((x) => (x.getAttribute('href') || '').includes(postId)),
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


  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.source !== 'realtyz-extension') return;
    if (msg.type === 'RZ_POST_TO_GROUP') {
      postToGroup(msg.job || {})
        .then((res) => sendResponse(res))
        .catch((e) => sendResponse({ ok: false, reason: String((e && e.message) || e) }));
      return true;
    }
    if (msg.type === 'RZ_POST_FIRST_COMMENT') {
      postFirstCommentToPage(msg.job || {})
        .then((res) => sendResponse(res))
        .catch((e) => sendResponse({ ok: false, reason: String((e && e.message) || e) }));
      return true;
    }
  });
})();

