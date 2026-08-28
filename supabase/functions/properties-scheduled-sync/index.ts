// properties-scheduled-sync
// Twice-daily background inventory refresh. Pulls freshly published Yad2
// (and Homely) listings for each workspace's own territory so the app can
// stay LOCAL-FIRST: the /properties page never triggers a live scrape.
//
// Invoked by pg_cron twice a day. Also callable manually with
// { owner_id, cities } for a targeted run.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const DEFAULT_CITIES = ['הרצליה', 'רמת השרון'];
const DEAL_TYPES: Array<'sale' | 'rent'> = ['sale', 'rent'];
// Keep well under the 150s edge idle timeout even though work runs in the
// background after the response is flushed.
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

async function runSync(
  admin: any,
  requestedOwner: string | undefined,
  requestedCities: string[] | undefined,
) {
  const started = Date.now();
  const timeLeft = () => BUDGET_MS - (Date.now() - started);

  let owners: string[] = [];
  if (requestedOwner) {
    owners = [requestedOwner];
  } else {
    const { data } = await admin.from('listings').select('user_id').not('user_id', 'is', null).limit(2000);
    owners = Array.from(new Set((data ?? []).map((r: any) => r.user_id).filter(Boolean))).slice(0, 10);
  }

  for (const owner of owners) {
    // Territory = the agent's configured service areas, else the house default.
    let cities = requestedCities ?? DEFAULT_CITIES;
    if (!requestedCities) {
      const { data: prof } = await admin
        .from('profiles').select('service_areas').eq('id', owner).maybeSingle();
      const areas = Array.isArray((prof as any)?.service_areas) ? (prof as any).service_areas as string[] : [];
      const derived = Array.from(new Set(areas.map((a) => (a.includes(' - ') ? a.split(' - ')[0] : a).trim()).filter(Boolean)));
      if (derived.length) cities = derived.slice(0, 4);
    }

    for (const city of cities) {
      for (const deal of DEAL_TYPES) {
        if (timeLeft() < 20_000) {
          console.log('[properties-scheduled-sync] budget exhausted, stopping', { owner, city, deal });
          return;
        }
        try {
          const d: any = await callFunction('yad2-unlocker', {
            owner_id: owner,
            city,
            listing_type: deal,
            mode: 'search',
            limit: 40,
            pages: 1,
          });
          console.log('[properties-scheduled-sync] synced', {
            owner, city, deal,
            count: Array.isArray(d?.results) ? d.results.length : 0,
            error: d?.error ? String(d.detail ?? d.error).slice(0, 200) : undefined,
          });
        } catch (e) {
          console.warn('[properties-scheduled-sync] failed', { owner, city, deal, error: (e as Error).message });
        }
      }
    }
  }
  console.log('[properties-scheduled-sync] done', { owners: owners.length, elapsed_ms: Date.now() - started });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const body = await req.json().catch(() => ({} as any));
  const requestedOwner: string | undefined = body?.owner_id ? String(body.owner_id) : undefined;
  const requestedCities: string[] | undefined = Array.isArray(body?.cities) && body.cities.length
    ? body.cities.map(String)
    : undefined;

  // Freshness stats for the "new in the last 7 days" badge/counter.
  const since = new Date(Date.now() - FRESH_DAYS * 864e5).toISOString();
  const { count: freshCount } = await admin
    .from('listings')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', since);

  // Scraping every city/deal-type inline blows past the 150s idle timeout, so
  // the work continues after the response is flushed.
  const task = runSync(admin, requestedOwner, requestedCities)
    .catch((e) => console.error('[properties-scheduled-sync] fatal', e));
  // @ts-ignore EdgeRuntime is provided by the Supabase edge runtime.
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(task);

  return json({
    ok: true,
    queued: true,
    fresh_last_7_days: freshCount ?? 0,
  });

});
