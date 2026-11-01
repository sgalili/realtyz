// yad2-agency-import
// Discovers every ad on an authorized broker's Yad2 agency page (walking its
// pagination) and returns the exact item URLs. Each item is then imported by
// the client as an independent task through the existing yad2-unlocker item
// import, so properties enter the workspace one by one.
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';
import { cachedScrapingText, trackScraping } from '../_shared/scrapingAudit.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const BROKER_ROLES = ['managing_broker', 'agent', 'lead_agent', 'junior_agent', 'super_admin'];
const MAX_PAGES = 10;
const MAX_ITEMS = 200;
const CACHE_SECONDS = 6 * 60 * 60;

export function itemIdsFromHtml(html: string): string[] {
  const ids = new Set<string>();
  for (const m of html.matchAll(/\/realestate\/item\/(?:[a-z0-9-]+\/)?([a-z0-9]{6,12})(?=["'?\/\s<])/gi)) ids.add(m[1].toLowerCase());
  const next = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  if (next) for (const m of next.matchAll(/"token"\s*:\s*"([a-z0-9]{6,12})"/gi)) ids.add(m[1].toLowerCase());
  return [...ids];
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ message: 'בקשה לא תקינה' }, 405);
  const backend = Deno.env.get('SUPABASE_URL'), anon = Deno.env.get('SUPABASE_ANON_KEY');
  if (!backend || !anon) return json({ message: 'שירות הייבוא אינו זמין' }, 500);
  const client = createClient(backend, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: { user } } = await client.auth.getUser();
  if (!user) return json({ error: 'not_authenticated', message: 'יש להתחבר מחדש' }, 401);
  const { data: owner } = await client.rpc('current_workspace_owner');
  if (!owner) return json({ error: 'workspace_unavailable', message: 'סביבת העבודה אינה זמינה' }, 403);
  const { data: allowed } = await client.rpc('ws_current_access', { _ws: owner });
  if (!allowed) return json({ error: 'workspace_forbidden', message: 'אין הרשאה לסביבת העבודה' }, 403);
  const { data: roles } = await client.from('user_roles').select('role').eq('user_id', user.id);
  if (!roles?.some(r => BROKER_ROLES.includes(r.role))) return json({ error: 'forbidden', message: 'ייבוא מלא מיד2 זמין למתווכים מאומתים בלבד' }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ message: 'בקשה לא תקינה' }, 400); }
  let pageUrl: URL;
  try {
    const raw = typeof body?.url === 'string' ? body.url.trim() : '';
    pageUrl = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (pageUrl.protocol !== 'https:' || !/(^|\.)yad2\.co\.il$/i.test(pageUrl.hostname) || pageUrl.username || !/^\/realestate\/agency\/[^/]+/i.test(pageUrl.pathname)) throw new Error('invalid');
    pageUrl.hash = ''; pageUrl.searchParams.delete('page');
  } catch { return json({ error: 'invalid_url', message: 'הדביקו את הקישור לעמוד המשרד שלכם ביד2 (realestate/agency)' }, 400); }

  const token = Deno.env.get('BRIGHTDATA_API_TOKEN');
  const zone = Deno.env.get('BRIGHTDATA_UNLOCKER_ZONE') ?? Deno.env.get('BRIGHTDATA_ZONE') ?? 'reatyz_yad2';
  if (!token) return json({ error: 'not_configured', message: 'שירות הייבוא מיד2 אינו מוגדר' }, 503);
  const deadline = Date.now() + 100000;
  const fetchPage = (url: string) => cachedScrapingText('agency_import', url, CACHE_SECONDS, async () => {
    const result = await trackScraping('agency_import', 'rest', url, async () => {
      const res = await fetch('https://api.brightdata.com/request', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ zone, url, format: 'raw' }), signal: AbortSignal.timeout(Math.min(30000, Math.max(1000, deadline - Date.now()))) });
      return { status: res.status, html: await res.text() };
    }, v => ({ status: v.status, bytes: new TextEncoder().encode(v.html).length }));
    if (result.status >= 400) throw new Error(`provider_${result.status}`);
    return result.html;
  });

  const ids: string[] = [];
  let pages = 0, partial = false;
  try {
    for (let p = 1; p <= MAX_PAGES; p++) {
      if (Date.now() > deadline - 5000) { partial = true; break; }
      const u = new URL(pageUrl.href);
      if (p > 1) u.searchParams.set('page', String(p));
      const found = itemIdsFromHtml(await fetchPage(u.href));
      pages++;
      const fresh = found.filter(id => !ids.includes(id));
      if (!fresh.length) break;
      ids.push(...fresh);
      if (ids.length >= MAX_ITEMS) { partial = true; break; }
    }
  } catch (e) {
    console.error('agency discovery failed', e instanceof Error ? e.message : e);
    if (!ids.length) return json({ error: 'fetch_failed', message: 'לא ניתן לקרוא את עמוד המשרד ביד2 כרגע. נסו שוב מאוחר יותר.' }, 502);
    partial = true;
  }
  const items = ids.slice(0, MAX_ITEMS).map(id => `https://www.yad2.co.il/realestate/item/${id}`);
  return json({ ok: true, source_url: pageUrl.href, pages_read: pages, partial, items });
});
