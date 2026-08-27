/* Realtyz Group Sync — collects the user's Facebook groups, Page posts and
 * comment trees straight from the live logged-in session, so the app can keep
 * importing even when the Graph API refuses the request (permission errors /
 * "Unsupported get request"). */
(function () {
  const collectGroups = () => {
    const map = new Map();
    document.querySelectorAll('a[href*="/groups/"]').forEach((a) => {
      const m = (a.getAttribute('href') || '').match(/facebook\.com\/groups\/([A-Za-z0-9._-]+)|^\/groups\/([A-Za-z0-9._-]+)/);
      const id = m && (m[1] || m[2]);
      if (!id || ['joins', 'feed', 'discover', 'create'].includes(id)) return;
      const name = (a.innerText || '').trim().split('\n')[0];
      if (!name) return;
      const row = a.closest('[role="listitem"], [role="row"], li, div');
      const image = a.querySelector('img') || row?.querySelector('img');
      const backgroundNode = row?.querySelector('[style*="background-image"]');
      const background = backgroundNode?.style?.backgroundImage?.match(/url\(["']?([^"')]+)["']?\)/)?.[1] || null;
      const icon = image?.currentSrc || image?.src || background;
      if (!map.has(id)) {
        map.set(id, { group_id: id, group_name: name, group_icon: icon, group_url: `https://www.facebook.com/groups/${id}` });
      }
    });
    return [...map.values()];
  };

  /* ── Page posts ────────────────────────────────────────────────────────── */
  const postIdFromHref = (href) => {
    const s = String(href || '');
    const m = s.match(/\/posts\/(?:pfbid[\w-]+|(\d{5,}))/) ||
      s.match(/permalink\/(\d{5,})/) ||
      s.match(/story_fbid=(\d{5,})/) ||
      s.match(/\/videos\/(\d{5,})/);
    return m ? (m[1] || s.match(/\/posts\/(pfbid[\w-]+)/)?.[1] || null) : null;
  };

  const collectPosts = () => {
    const map = new Map();
    document.querySelectorAll('div[role="article"]').forEach((art) => {
      const link = [...art.querySelectorAll('a[href]')]
        .map((a) => a.getAttribute('href') || '')
        .find((h) => /\/posts\/|permalink|story_fbid=|\/videos\//.test(h));
      const id = postIdFromHref(link);
      if (!id || map.has(id)) return;
      const text = (art.innerText || '').trim().slice(0, 5000);
      const media = [...art.querySelectorAll('img')]
        .map((i) => i.currentSrc || i.src)
        .filter((u) => u && /scontent|fbcdn/.test(u));
      const time = art.querySelector('a[href] abbr, [data-utime]');
      map.set(id, {
        post_id: id,
        message: text,
        url: link && link.startsWith('http') ? link : (link ? `https://www.facebook.com${link}` : null),
        created_time: time?.getAttribute?.('title') || time?.getAttribute?.('data-utime') || null,
        media: [...new Set(media)].slice(0, 10),
      });
    });
    return [...map.values()];
  };

  /* ── Comment trees ─────────────────────────────────────────────────────── */
  const collectComments = () => {
    const byPost = new Map();
    document.querySelectorAll('div[role="article"]').forEach((art) => {
      const label = art.getAttribute('aria-label') || '';
      // Comment articles are labelled "Comment by <name>" / "תגובה מ..."
      if (!/comment|תגוב/i.test(label)) return;
      const container = art.closest('div[role="article"]:not([aria-label*="omment"])') || document.body;
      const parentLink = [...container.querySelectorAll('a[href]')]
        .map((a) => a.getAttribute('href') || '')
        .find((h) => /\/posts\/|permalink|story_fbid=/.test(h));
      const postId = postIdFromHref(parentLink) || 'unknown';
      const nameNode = art.querySelector('a[role="link"] span, strong, h3');
      const name = (nameNode?.innerText || '').trim() || null;
      const text = (art.innerText || '')
        .split('\n')
        .filter((l) => l.trim() && l.trim() !== name)
        .slice(0, 6)
        .join(' ')
        .trim()
        .slice(0, 4000);
      if (!text) return;
      const permalink = [...art.querySelectorAll('a[href*="comment_id"]')]
        .map((a) => a.getAttribute('href'))[0] || null;
      const cid = (permalink && permalink.match(/comment_id=(\d+)/)?.[1]) ||
        `dom_${postId}_${btoa(unescape(encodeURIComponent(`${name || ''}|${text}`))).slice(0, 24)}`;
      const list = byPost.get(postId) || [];
      if (!list.some((c) => c.id === cid)) {
        list.push({
          id: cid,
          message: text,
          created_time: null,
          from: { id: null, name },
          permalink_url: permalink && permalink.startsWith('http') ? permalink : null,
          parent: null,
        });
      }
      byPost.set(postId, list);
    });
    return [...byPost.entries()].map(([post_id, comments]) => ({ post_id, comments }));
  };

  const push = () => {
    const payload = { rzGroupsAt: Date.now() };
    const groups = collectGroups();
    if (groups.length) payload.rzGroups = groups;
    const posts = collectPosts();
    if (posts.length) { payload.rzPosts = posts; payload.rzPostsAt = Date.now(); }
    const comments = collectComments();
    if (comments.length) { payload.rzComments = comments; payload.rzCommentsAt = Date.now(); }
    if (Object.keys(payload).length > 1) chrome.storage.local.set(payload);
  };

  push();
  setInterval(push, 4000);
  window.addEventListener('scroll', () => { clearTimeout(window.__rzT); window.__rzT = setTimeout(push, 800); });
})();
