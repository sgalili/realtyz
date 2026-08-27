/* Realtyz Group Sync — collects the user's Facebook groups from the live session. */
(function () {
  const collect = () => {
    const map = new Map();
    document.querySelectorAll('a[href*="/groups/"]').forEach((a) => {
      const m = (a.getAttribute('href') || '').match(/facebook\.com\/groups\/([A-Za-z0-9._-]+)|^\/groups\/([A-Za-z0-9._-]+)/);
      const id = m && (m[1] || m[2]);
      if (!id || ['joins', 'feed', 'discover', 'create'].includes(id)) return;
      const name = (a.innerText || '').trim().split('\n')[0];
      if (!name) return;
      const icon = a.querySelector('img')?.src || null;
      if (!map.has(id)) {
        map.set(id, { group_id: id, group_name: name, group_icon: icon, group_url: `https://www.facebook.com/groups/${id}` });
      }
    });
    return [...map.values()];
  };

  const push = () => {
    const groups = collect();
    if (groups.length === 0) return;
    chrome.storage.local.set({ rzGroups: groups, rzGroupsAt: Date.now() });
  };

  push();
  setInterval(push, 4000);
  window.addEventListener('scroll', () => { clearTimeout(window.__rzT); window.__rzT = setTimeout(push, 800); });
})();
