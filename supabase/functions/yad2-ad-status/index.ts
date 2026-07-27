// yad2-ad-status
// Cheap liveness probe for Yad2 ad URLs. The UI calls it before showing the
// official Yad2 button so dead ads never render a link to a missing page.
//
// POST { urls: string[] }  ->  { statuses: { [url]: 'live' | 'gone' | 'unknown' } }
//
// 'unknown' is returned whenever Yad2 blocks the probe (403/429/network) —
// the caller decides how to treat it (we keep the button hidden only on 'gone').

import { corsHeaders } from '../_shared/cors.ts';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const GONE_MARKERS = [
  'המודעה שחיפשת אינה קיימת',
  'המודעה אינה קיימת',
  'המודעה הוסרה',
  'הדף שחיפשת לא נמצא',
  'לא הצלחנו למצוא את הדף',
  'page not found',
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isItemUrl(u: string): boolean {
  try {
    const p = new URL(u).pathname;
    return /\/item\/[A-Za-z0-9_-]+/.test(p);
  } catch {
    return false;
  }
}

async function probe(url: string): Promise<'live' | 'gone' | 'unknown'> {
  if (!/^https?:\/\//i.test(url) || !/yad2\.co\.il/i.test(url)) return 'gone';
  if (!isItemUrl(url)) return 'gone';

  try {
    const res = await fetch(url, {
      redirect: 'manual',
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'he-IL,he;q=0.9',
      },
    });

    if (res.status === 404 || res.status === 410) return 'gone';

    // A redirect away from the item page means the ad is no longer available.
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location') || '';
      try { await res.body?.cancel(); } catch { /* ignore */ }
      if (!loc) return 'unknown';
      const abs = new URL(loc, url).toString();
      return isItemUrl(abs) ? 'live' : 'gone';
    }

    if (res.status === 403 || res.status === 429 || res.status >= 500) {
      try { await res.body?.cancel(); } catch { /* ignore */ }
      return 'unknown';
    }

    const html = (await res.text()).slice(0, 200_000);
    const low = html.toLowerCase();
    if (GONE_MARKERS.some((m) => (m === m.toLowerCase() ? low.includes(m) : html.includes(m)))) return 'gone';
    return 'live';
  } catch {
    return 'unknown';
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({} as any));
    const urls: string[] = Array.from(
      new Set((Array.isArray(body?.urls) ? body.urls : []).map((u: unknown) => String(u ?? '').trim()).filter(Boolean)),
    ).slice(0, 40);

    const statuses: Record<string, 'live' | 'gone' | 'unknown'> = {};
    const CONCURRENCY = 6;
    for (let i = 0; i < urls.length; i += CONCURRENCY) {
      const slice = urls.slice(i, i + CONCURRENCY);
      const res = await Promise.all(slice.map((u) => probe(u)));
      slice.forEach((u, idx) => { statuses[u] = res[idx]; });
    }

    return json({ ok: true, statuses });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
