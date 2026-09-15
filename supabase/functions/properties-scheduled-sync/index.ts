// properties-scheduled-sync
// THE ONLY entry point that is allowed to spend Bright Data credits on Yad2.
//
// HARD RULES
//  1. Exactly two scrape runs per day: 08:00 and 18:00 Asia/Jerusalem. The
//     slot is claimed through `claim_market_scrape_slot()`, which refuses
//     anything outside those hours and any second claim for the same slot.
//     Every other call in the app reads the shared pool instead.
//  2. Incremental only: each city + deal type keeps a watermark (the newest
//     publication date already collected) so we never pay for known ads.
//  3. Central and shared: rows land in `market_listings`, which every signed-in
//     workspace can read. A workspace working in the same city sees the fresh
//     inventory instantly, without a second API call and without duplicating
//     the row (listings.source_url is globally unique).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const DEFAULT_CITIES = ['הרצליה', 'רמת השרון'];
const DEAL_TYPES: Array<'sale' | 'rent'> = ['sale', 'rent'];
const MAX_CITIES = 8;
const BUDGET_MS = 120_000;
const FRESH_DAYS = 7;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function callFunction(name: string, body: unknown) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`[${r.status}] ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

/** Union of every workspace's service areas — one scrape serves them all. */
async function resolveCities(admin: any, requested?: string[]): Promise<string[]> {
  if (requested?.length) return requested.slice(0, MAX_CITIES);
  const { data } = await admin.from('profiles').select('service_areas').limit(500);
  const set = new Set<string>();
  for (const row of data ?? []) {
    const areas = Array.isArray((row as any)?.service_areas) ? (row as any).service_areas as string[] : [];
    for (const a of areas) {
      const city = String(a ?? '').includes(' - ') ? String(a).split(' - ')[0] : String(a ?? '');
      const c = city.trim();
      if (c) set.add(c);
    }
  }
  for (const c of DEFAULT_CITIES) set.add(c);
  return Array.from(set).slice(0, MAX_CITIES);
}

async function runSync(admin: any, token: string, cities: string[]) {
  const started = Date.now();
  const timeLeft = () => BUDGET_MS - (Date.now() - started);
  let scraped = 0;
  let newRows = 0;
  let shared = 0;
  const runStartedAt = new Date().toISOString();

  try {
    for (const city of cities) {
      for (const deal of DEAL_TYPES) {
        if (timeLeft() < 20_000) {
          console.log('[properties-scheduled-sync] budget exhausted', { city, deal });
          break;
        }

        const { data: state } = await admin
          .from('market_scrape_state')
          .select('id, watermark_published_at')
          .eq('source', 'yad2').eq('city', city).eq('deal_type', deal)
          .maybeSingle();
        const since: string | null = (state as any)?.watermark_published_at ?? null;

        try {
          const d: any = await callFunction('yad2-unlocker', {
            city,
            listing_type: deal,
            mode: 'search',
            limit: 40,
            pages: 1,
            scrape_token: token,
            since,
          });
          const count = Array.isArray(d?.results) ? d.results.length : 0;
          scraped += Number(d?.records_scraped ?? count) || 0;
          newRows += Number(d?.records_saved ?? 0) || 0;

          const newest: string | null = d?.newest_published_at ?? null;
          const watermark = newest && (!since || new Date(newest) > new Date(since)) ? newest : since;
          const payload = {
            source: 'yad2',
            city,
            deal_type: deal,
            watermark_published_at: watermark,
            last_run_at: new Date().toISOString(),
            last_success_at: new Date().toISOString(),
            last_new_count: Number(d?.records_saved ?? 0) || 0,
          };
          if ((state as any)?.id) {
            await admin.from('market_scrape_state').update(payload).eq('id', (state as any).id);
          } else {
            await admin.from('market_scrape_state').insert(payload);
          }

          console.log('[properties-scheduled-sync] scraped', {
            city, deal, count, saved: d?.records_saved ?? 0, skipped: d?.skipped_not_new ?? 0, since,
          });
        } catch (e) {
          console.warn('[properties-scheduled-sync] failed', { city, deal, error: (e as Error).message });
          await admin.from('market_scrape_state').upsert({
            source: 'yad2', city, deal_type: deal, last_run_at: new Date().toISOString(),
          }, { onConflict: 'source,city,deal_type' });
        }
      }
    }

    // The pool itself IS the sharing layer: `market_listings` is readable by
    // every signed-in user, so the moment a row lands here every workspace in
    // that city sees it — with no per-workspace API call and no duplicated row
    // (listings.source_url is globally unique by design).
    const { count: freshShared } = await admin
      .from('market_listings')
      .select('*', { count: 'exact', head: true })
      .gte('last_seen_at', runStartedAt);
    shared = Number(freshShared ?? 0) || 0;

    // Homely runs on the same schedule so the whole inventory refresh is one job.
    try {
      await callFunction('homely-daily-sync', { reason: 'scheduled_slot' });
    } catch (e) {
      console.warn('[properties-scheduled-sync] homely sync failed', (e as Error).message);
    }

    await admin.rpc('finish_market_scrape_run', {
      _token: token, _status: 'success', _scraped: scraped, _new_rows: newRows, _shared: shared,
    });
  } catch (e) {
    await admin.rpc('finish_market_scrape_run', {
      _token: token, _status: 'error', _scraped: scraped, _new_rows: newRows, _shared: shared,
      _error: String((e as Error)?.message ?? e).slice(0, 500),
    });
    throw e;
  }

  console.log('[properties-scheduled-sync] done', {
    cities: cities.length, scraped, newRows, shared, elapsed_ms: Date.now() - started,
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const body = await req.json().catch(() => ({} as any));
  const requestedCities: string[] | undefined = Array.isArray(body?.cities) && body.cities.length
    ? body.cities.map(String)
    : undefined;

  // Freshness stats for the "new in the last 7 days" counter.
  const freshSince = new Date(Date.now() - FRESH_DAYS * 864e5).toISOString();
  const { count: freshCount } = await admin
    .from('market_listings')
    .select('*', { count: 'exact', head: true })
    .gte('first_seen_at', freshSince);

  // RATE LIMIT: claim one of the two daily slots. Anything else is a no-op.
  const { data: claim, error: claimErr } = await admin.rpc('claim_market_scrape_slot', { _source: 'yad2' });
  if (claimErr) {
    console.error('[properties-scheduled-sync] claim failed', claimErr.message);
    return json({ ok: false, error: 'claim_failed', detail: claimErr.message }, 500);
  }
  const c: any = claim ?? {};
  if (!c.allowed) {
    console.log('[properties-scheduled-sync] slot not available', c);
    return json({
      ok: true,
      queued: false,
      skipped: true,
      reason: c.reason ?? 'not_allowed',
      detail: 'שאיבת נתונים מיד-2 מתבצעת פעמיים ביום בלבד — 08:00 ו-18:00.',
      fresh_last_7_days: freshCount ?? 0,
    });
  }

  const cities = await resolveCities(admin, requestedCities);
  const task = runSync(admin, String(c.token), cities)
    .catch((e) => console.error('[properties-scheduled-sync] fatal', e));
  // @ts-ignore EdgeRuntime is provided by the Supabase edge runtime.
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(task);

  return json({
    ok: true,
    queued: true,
    slot: c.slot,
    cities,
    fresh_last_7_days: freshCount ?? 0,
  });
});
