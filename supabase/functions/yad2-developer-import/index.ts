import { createClient } from 'npm:@supabase/supabase-js@2.45.0';
import { readPage } from './extract.ts';
import { developerImportPageKind, projectInventoryUrl } from '../_shared/yad2DeveloperImport.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { cachedScrapingText, trackScraping } from '../_shared/scrapingAudit.ts';
import { DEVELOPER_CACHE_SECONDS } from '../_shared/scrapingPolicy.ts';
import { adminClient, isSuperAdmin, requireCaller } from '../_shared/authz.ts';
import { ProviderRateLimitError, retryAfterMs } from '../_shared/brightDataThrottle.ts';
import { rotatingUnlockerPayload, UNLOCKER_USER_AGENTS } from '../_shared/brightDataRotation.ts';
import { IMPORT_DISCOVERY_BUDGET_MS } from '../_shared/importScanPolicy.ts';
const cors = corsHeaders;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ message: 'בקשה לא תקינה' }, 405);
  const backend = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  if (!backend || !anon) return json({ message: 'שירות הייבוא אינו זמין' }, 500);
  let body: any;
  try { body = await req.json(); } catch { return json({ message: 'בקשה לא תקינה' }, 400); }
  const pageOnly = body?.page_only === true;
  if (pageOnly) {
    const caller = await requireCaller(req, ['service']);
    if (caller instanceof Response) return caller;
    const admin = adminClient();
    const { data: job, error } = await admin.from('broker_import_jobs').select('created_by,status,lease_token').eq('id', typeof body?.admin_import_job_id === 'string' ? body.admin_import_job_id : '').maybeSingle();
    if (error || !job || job.status !== 'running' || !job.lease_token || job.lease_token !== body?.admin_import_lease_token || !await isSuperAdmin(job.created_by, admin)) return json({ error: 'forbidden', message: 'אין הרשאה לקריאת עמוד יזם בתור' }, 403);
  } else {
    const client = createClient(backend, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: { user } } = await client.auth.getUser();
    if (!user) return json({ error: 'not_authenticated', message: 'יש להתחבר מחדש' }, 401);
    const { data: roles, error: roleError } = await client.from('user_roles').select('role').eq('user_id', user.id);
    if (roleError || !roles?.some(r => r.role === 'developer' || r.role === 'super_admin')) return json({ error: 'forbidden', message: 'הייבוא זמין בחשבון יזם' }, 403);
    const { data: subscription, error: subscriptionError } = await client.rpc('get_developer_subscription_status');
    if (subscriptionError) return json({ error: 'subscription_status_unavailable', message: 'לא ניתן לאמת את חשבון היזם כרגע' }, 503);
    if (!(subscription as { active?: boolean } | null)?.active) return json({ error: 'developer_subscription_required', message: 'ייבוא פרויקטים זמין בחשבון יזם' }, 402);
  }
  let pageUrl: URL;
  try {
    const raw = typeof body.url === 'string' ? body.url.trim() : '';
    pageUrl = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (pageUrl.protocol !== 'https:' || !/(^|\.)yad2\.co\.il$/i.test(pageUrl.hostname)) throw new Error('invalid');
    if (!developerImportPageKind(pageUrl.href) && !(pageOnly && body.parent_project && projectInventoryUrl(pageUrl.href, body.parent_project.source_url) === pageUrl.href)) throw new Error('invalid');
    pageUrl.hash = '';
  } catch { return json({ error: 'invalid_url', message: 'הדביקו קישור תקין לעמוד יזם או לפרויקט ביד2' }, 400); }
  const token = Deno.env.get('BRIGHTDATA_API_TOKEN');
  const zone = Deno.env.get('BRIGHTDATA_UNLOCKER_ZONE') ?? Deno.env.get('BRIGHTDATA_ZONE') ?? 'web_unlocker4';
  if (!token) return json({ error: 'not_configured', message: 'שירות הייבוא מיד2 אינו מוגדר' }, 503);
  const deadline = Date.now() + IMPORT_DISCOVERY_BUDGET_MS;
  const fetchPage = async (url: string) => {
    const remaining = deadline - Date.now();
    if (remaining < 1500) throw new Error('import_deadline');
    const html = await cachedScrapingText('developer_import', url, DEVELOPER_CACHE_SECONDS, async () => {
      const result = await trackScraping('developer_import', 'rest', url, async () => {
        const res = await fetch('https://api.brightdata.com/request', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(rotatingUnlockerPayload(zone, url, Math.floor(Math.random() * UNLOCKER_USER_AGENTS.length))), signal: AbortSignal.timeout(Math.min(IMPORT_DISCOVERY_BUDGET_MS, remaining)) });
        return { status: res.status, html: await res.text(), retryAfterMs: retryAfterMs(res.headers.get('retry-after')) };
      }, value => ({ status: value.status, bytes: new TextEncoder().encode(value.html).length }));
      if (result.status === 429) throw new ProviderRateLimitError(result.retryAfterMs);
      if (result.status >= 400) throw new Error(`provider_${result.status}`);
      if (/captcha|access denied|verify you are human/i.test(result.html) && !/__NEXT_DATA__|projectName/.test(result.html)) throw new Error('source_blocked');
      return result.html;
    });
    return readPage(html, url, body.parent_project);
  };
  // Multi-page account imports must use developer-import-jobs. This endpoint
  // deliberately performs only one leased page read for the background workers.
  if (!pageOnly) return json({ error: 'background_queue_required', message: 'הייבוא מתבצע כעת ברקע, עמוד אחד בכל משימה' }, 400);
  try {
    const first = await fetchPage(pageUrl.href);
    return json({ ok: true, source_url: pageUrl.href, ...first });
  } catch (error) {
    console.error('Developer page import failed', { error: error instanceof Error ? error.message : 'unknown', source_url: pageUrl.href });
    if (error instanceof ProviderRateLimitError) return json({ error: 'brightdata_rate_limited', retry_after_ms: error.retryAfterMs, message: 'Bright Data הגביל זמנית את קצב הבקשות. ההתקדמות נשמרה לניסיון החוזר.' }, 429);
    return json({ error: 'fetch_failed', message: 'לא ניתן לקרוא את עמוד היזם ביד2 כרגע. נסו שוב או הוסיפו פרויקטים ידנית.' }, 502);
  }
});
