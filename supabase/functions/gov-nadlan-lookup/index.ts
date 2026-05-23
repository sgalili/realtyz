// Pipeline C — Nadlan analytics via Israeli government open data
// (nadlan.gov.il). Returns avg ₪/m², recent verified deals, and a
// 12-month trend. Cached 30 min in market_pulse_cache.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';

const CACHE_TTL_MS = 30 * 60 * 1000;

const BodySchema = z.object({
  city: z.string().min(1).max(60),
});

type Deal = {
  date: string;
  price: number;
  rooms: number | null;
  area_m2: number | null;
  address: string;
};

async function fetchNadlan(city: string): Promise<Deal[]> {
  // Public Nadlan search endpoint (returns JSON for the gov "deals near me" widget).
  const url = 'https://www.nadlan.gov.il/Nadlan.REST/Main/GetAssestAndDeals';
  const body = {
    Query: city,
    OrderByFilter: 'DealDate',
    OrderType: 'Desc',
    PageNo: 1,
    PageSize: 50,
  };
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'RealtyzAI/1.0 (+gov-nadlan-lookup)',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`Nadlan HTTP ${r.status}`);
  const j = await r.json().catch(() => ({}));
  const rows = (j?.AllResults ?? j?.ResultLapam ?? []) as Array<Record<string, unknown>>;
  return rows.slice(0, 50).map((row) => ({
    date: String(row.DEALDATE ?? row.DealDate ?? ''),
    price: Number(row.DEALAMOUNT ?? row.DealAmount ?? 0),
    rooms: row.ASSETROOMNUM != null ? Number(row.ASSETROOMNUM) : null,
    area_m2: row.DEALNATURE != null ? Number(row.DEALNATURE) : null,
    address: String(row.FULLADRESS ?? row.DisplayAdresse ?? ''),
  })).filter((d) => d.price > 0);
}

function summarize(deals: Deal[]) {
  if (!deals.length) return { avgPricePerSqm: null, dealCount: 0, trend: [] as Array<{ month: string; avg: number }> };
  const validForSqm = deals.filter((d) => d.area_m2 && d.area_m2 > 0);
  const avgPricePerSqm = validForSqm.length
    ? Math.round(validForSqm.reduce((s, d) => s + d.price / (d.area_m2 as number), 0) / validForSqm.length)
    : null;

  const byMonth = new Map<string, number[]>();
  for (const d of deals) {
    const m = d.date.slice(0, 7);
    if (!m) continue;
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m)!.push(d.price);
  }
  const trend = Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([month, vals]) => ({
      month,
      avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
    }));

  return { avgPricePerSqm, dealCount: deals.length, trend };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const token = authHeader.replace('Bearer ', '');
  const { data: claims, error: authErr } = await supabase.auth.getClaims(token);
  if (authErr || !claims?.claims) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const { city } = parsed.data;

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: cached } = await admin
    .from('market_pulse_cache')
    .select('payload, expires_at')
    .eq('source', 'nadlan')
    .eq('cache_key', city)
    .maybeSingle();

  if (cached && new Date(cached.expires_at) > new Date()) {
    return new Response(JSON.stringify({ success: true, source: 'cache', ...(cached.payload as object) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });
  }

  try {
    const deals = await fetchNadlan(city);
    const summary = summarize(deals);
    const recent = deals.slice(0, 10);
    const payload = { city, summary, recent, attribution: 'מקור: רשות המסים — נדל״ן (nadlan.gov.il)' };
    await admin.from('market_pulse_cache').upsert({
      source: 'nadlan',
      cache_key: city,
      payload,
      fetched_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
    }, { onConflict: 'source,cache_key' });
    return new Response(JSON.stringify({ success: true, source: 'live', ...payload }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: (e as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502,
    });
  }
});
