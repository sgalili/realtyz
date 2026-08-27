/* Realtyz Group Sync — hands the collected groups to the Realtyz app. */
(function () {
  const GROUPS_KEY = 'rz-ext-fb-groups';
  const INSTALLED_KEY = 'rz-ext-installed';

  const markInstalled = () => {
    try { localStorage.setItem(INSTALLED_KEY, '1'); } catch (e) { /* noop */ }
    try { document.documentElement.setAttribute('data-realtyz-extension', '1'); } catch (e) { /* noop */ }
  };

  const deliver = () => {
    chrome.storage.local.get(['rzGroups'], (res) => {
      const groups = res && res.rzGroups;
      if (!Array.isArray(groups) || groups.length === 0) return;
      try { localStorage.setItem(GROUPS_KEY, JSON.stringify(groups)); } catch (e) { /* noop */ }
      try { window.postMessage({ source: 'realtyz-extension', type: 'RZ_FB_GROUPS', groups }, window.location.origin); } catch (e) { /* noop */ }
      try { document.dispatchEvent(new CustomEvent('rz:ext-fb-groups', { detail: groups })); } catch (e) { /* noop */ }
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
  });
  document.addEventListener('rz:ext-fb-groups:request', deliver);
})();
