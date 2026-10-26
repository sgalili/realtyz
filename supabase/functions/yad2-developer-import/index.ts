import { createClient } from 'npm:@supabase/supabase-js@2.45.0';
import { mergeProject, readPage } from './extract.ts';
import { cachedScrapingText, trackScraping } from '../_shared/scrapingAudit.ts';
import { DEVELOPER_CACHE_SECONDS, MAX_DEVELOPER_PAGES, uniqueScrapingUrls } from '../_shared/scrapingPolicy.ts';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ message: 'בקשה לא תקינה' }, 405);
  const backend = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  if (!backend || !anon) return json({ message: 'שירות הייבוא אינו זמין' }, 500);
  const client = createClient(backend, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: { user } } = await client.auth.getUser();
  if (!user) return json({ error: 'not_authenticated', message: 'יש להתחבר מחדש' }, 401);
  const { data: roles, error: roleError } = await client.from('user_roles').select('role').eq('user_id', user.id);
  if (roleError || !roles?.some(r => r.role === 'developer' || r.role === 'super_admin')) return json({ error: 'forbidden', message: 'הייבוא זמין בחשבון יזם' }, 403);
  let body: any;
  try { body = await req.json(); } catch { return json({ message: 'בקשה לא תקינה' }, 400); }
  let pageUrl: URL;
  try {
    const raw = typeof body.url === 'string' ? body.url.trim() : '';
    pageUrl = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (pageUrl.protocol !== 'https:' || !/(^|\.)yad2\.co\.il$/i.test(pageUrl.hostname) || !/^\/yad1\/developers\/[^/]+\/?$/i.test(pageUrl.pathname)) throw new Error('invalid');
    pageUrl.hash = '';
  } catch { return json({ error: 'invalid_url', message: 'הדביקו את הקישור לעמוד הראשי של היזם ביד2, ולא למודעה או לפרויקט בודד' }, 400); }
  const token = Deno.env.get('BRIGHTDATA_API_TOKEN');
  const zone = Deno.env.get('BRIGHTDATA_UNLOCKER_ZONE') ?? Deno.env.get('BRIGHTDATA_ZONE') ?? 'reatyz_yad2';
  if (!token) return json({ error: 'not_configured', message: 'שירות הייבוא מיד2 אינו מוגדר' }, 503);
  const failed: string[] = [];
  const deadline = Date.now() + 115000;
  const failReasons: Record<string, string> = {};
  const fetchPage = async (url: string) => {
    const remaining = deadline - Date.now();
    if (remaining < 1500) throw new Error('import_deadline');
    const html = await cachedScrapingText('developer_import', url, DEVELOPER_CACHE_SECONDS, async () => {
      const result = await trackScraping('developer_import', 'rest', url, async () => {
        const res = await fetch('https://api.brightdata.com/request', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ zone, url, format: 'raw' }), signal: AbortSignal.timeout(Math.min(30000, remaining)) });
        return { status: res.status, html: await res.text() };
      }, value => ({ status: value.status, bytes: new TextEncoder().encode(value.html).length }));
      if (result.status >= 400) throw new Error(`provider_${result.status}`);
      if (/captcha|access denied|verify you are human/i.test(result.html) && !/__NEXT_DATA__|projectName/.test(result.html)) throw new Error('source_blocked');
      return result.html;
    });
    return readPage(html, url);
  };
  try {
    const first = await fetchPage(pageUrl.href);
    const result = { developer: first.developer, projects: [...first.projects] };
    // Follow only links belonging to projects discovered on the developer's page.
    // Never discover projects globally or mix related advertiser recommendations.
    const visited = new Set<string>([pageUrl.href]);
    const pending = uniqueScrapingUrls(first.links);
    for (let i = 0; i < pending.length; i++) {
      if (visited.size >= MAX_DEVELOPER_PAGES) { pending.slice(i).forEach(url => { failed.push(url); failReasons[url] = 'batch_limit'; }); break; }
      const url = pending[i].split('?')[0];
      if (Date.now() >= deadline - 1500) { pending.slice(i).filter(item => !visited.has(item)).forEach(item => { failed.push(item); failReasons[item] = 'import_deadline'; }); break; }
      if (i > 0) await new Promise(r => setTimeout(r, 1500));
      if (visited.has(url)) continue;
      visited.add(url);
      try {
        const details = await fetchPage(url);
        const parent = result.projects.findIndex(p => p.source_url === url);
        if (parent >= 0) {
          const old = result.projects[parent];
          const matching = details.projects.find(p => p.source_project_id === old.source_project_id || p.name === old.name || p.source_url === url) ?? (details.projects.length === 1 ? details.projects[0] : null);
          if (matching) result.projects[parent] = mergeProject(old, { ...matching, source_project_id: old.source_project_id ?? matching.source_project_id, source_url: url });
          else failed.push(url);
        } else {
          const matching = details.projects.find(p => p.source_url === url) ?? (details.projects.length === 1 ? details.projects[0] : null);
          if (matching) {
            const existing = result.projects.findIndex(p => matching.source_project_id && p.source_project_id === matching.source_project_id);
            if (existing >= 0) result.projects[existing] = mergeProject(result.projects[existing], matching);
            else result.projects.push({ ...matching, source_url: url });
          } else failed.push(url);
        }
      } catch (e) { console.error('project page failed', url, e instanceof Error ? e.message : e); failed.push(url); failReasons[url] = e instanceof Error ? e.message : String(e); }
    }
    const missingHierarchy = result.projects.filter(project => !project.apartments.length).map(project => project.name);
    return json({ ok: true, source_url: pageUrl.href, ...result, completeness: { complete: failed.length === 0 && result.projects.length > 0 && missingHierarchy.length === 0, pages_read: visited.size - failed.filter(url => visited.has(url)).length, failed_urls: failed, fail_reasons: failReasons, projects_without_unit_details: missingHierarchy }, warnings: [...(failed.length ? ['חלק מעמודי הפרויקטים לא נקראו. הפרטים הזמינים נשמרו בתצוגה המקדימה; אפשר לנסות שוב.'] : []), ...(missingHierarchy.length ? ['בחלק מהפרויקטים לא נמצאו פרטי יחידות במקור. הפרויקטים נשמרים בלי להמציא דירות או מחירים.'] : []), ...(result.projects.length === 0 ? ['לא נמצאו פרויקטים שניתן לקרוא בעמוד היזם.'] : [])] });
  } catch (error) {
    console.error('Developer import failed', { error: error instanceof Error ? error.message : 'unknown', source_url: pageUrl.href });
    return json({ error: 'fetch_failed', message: 'לא ניתן לקרוא את עמוד היזם ביד2 כרגע. נסו שוב או הוסיפו פרויקטים ידנית.' }, 502);
  }
});
