// yad2-ad-status
// Liveness probe for Yad2 ad URLs. The UI calls it before showing the official
// Yad2 button so a dead/removed ad never renders a link to a missing page.
//
// POST { urls: string[] }  ->  { statuses: { [url]: 'live' | 'gone' | 'unknown' } }
//
// Yad2 sits behind a Radware bot wall, so direct fetches always return a
// challenge shell. We therefore probe through the Bright Data Web Unlocker
// (same zone as yad2-unlocker) and read the real upstream status.
// 'unknown' means we could not verify (no token / blocked / transient) — the
// UI keeps the button hidden unless the ad is verified 'live'.

import { corsHeaders } from '../_shared/cors.ts';

const BD_TOKEN = Deno.env.get('BRIGHTDATA_API_TOKEN') ?? '';
const BD_ZONE = Deno.env.get('BRIGHTDATA_ZONE') ?? 'yad2';

const GONE_MARKERS = [
  'המודעה שחיפשת אינה קיימת',
  'המודעה אינה קיימת',
  'המודעה הוסרה',
  'הדף שחיפשת לא נמצא',
  '"notfound":true',
  '"statuscode":404',
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function itemToken(u: string): string | null {
  try {
    const m = new URL(u).pathname.match(/\/item\/([A-Za-z0-9_-]+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** Fetch a URL through the Bright Data Web Unlocker; returns upstream status + body. */
async function bdFetch(url: string): Promise<{ status: number; body: string } | null> {
  try {
    const r = await fetch('https://api.brightdata.com/request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${BD_TOKEN}`,
      },
      body: JSON.stringify({ zone: BD_ZONE, url, format: 'raw', method: 'GET' }),
    });
    const body = await r.text();
    const upstream = Number(r.headers.get('x-response-status') ?? r.headers.get('x-brd-status') ?? r.status);
    const errCode = r.headers.get('x-brd-err-code');
    console.log(`[yad2-ad-status] bd ${url} gw=${r.status} upstream=${upstream} err=${errCode ?? '-'} bytes=${body.length} preview=${JSON.stringify(body.slice(0, 200))}`);
    if (errCode) return null;
    return { status: Number.isFinite(upstream) ? upstream : r.status, body };
  } catch {
    return null;
  }
}

async function probe(url: string): Promise<'live' | 'gone' | 'unknown'> {
  if (!/^https?:\/\//i.test(url) || !/yad2\.co\.il/i.test(url)) return 'gone';
  const token = itemToken(url);
  if (!token) return 'gone';
  if (!BD_TOKEN) return 'unknown';

  // The JSON item feed is the cheapest authoritative signal.
  const feed = await bdFetch(`https://gw.yad2.co.il/realestate-feed/item/${token}`);
  if (feed) {
    if (feed.status === 404 || feed.status === 410) return 'gone';
    if (feed.status >= 200 && feed.status < 300) {
      const low = feed.body.toLowerCase();
      if (GONE_MARKERS.some((m) => low.includes(m.toLowerCase()))) return 'gone';
      try {
        const j = JSON.parse(feed.body);
        const d = j?.data ?? j;
        if (d && typeof d === 'object' && Object.keys(d).length > 0) return 'live';
      } catch {
        if (feed.body.length > 500) return 'live';
      }
    }
  }

  // Fallback: the public ad page itself.
  const page = await bdFetch(url);
  if (!page) return 'unknown';
  if (page.status === 404 || page.status === 410) return 'gone';
  if (page.status < 200 || page.status >= 300) return 'unknown';
  const low = page.body.toLowerCase();
  if (GONE_MARKERS.some((m) => low.includes(m.toLowerCase()))) return 'gone';
  if (low.includes('__next_data__') || low.includes(token.toLowerCase())) return 'live';
  return 'unknown';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({} as any));
    const urls: string[] = Array.from(
      new Set((Array.isArray(body?.urls) ? body.urls : []).map((u: unknown) => String(u ?? '').trim()).filter(Boolean)),
    ).slice(0, 30);

    const statuses: Record<string, 'live' | 'gone' | 'unknown'> = {};
    const CONCURRENCY = 5;
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
