// Bright Data detailed usage & cost breakdown.
// Returns line-by-line usage per zone/day so the operator can spot the
// expensive operations. Every Bright Data endpoint generation is probed and
// whatever answers is normalized into a flat list of line items.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

type LineItem = {
  date: string | null;
  zone: string | null;
  requests: number | null;
  bytes: number | null;
  cost: number | null;
  label: string;
};

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Best-effort normalization of the many shapes Bright Data returns. */
function normalize(payload: unknown, fallbackZone: string): LineItem[] {
  const out: LineItem[] = [];

  const pushRow = (row: Record<string, unknown>, zoneHint?: string) => {
    const zone = String(row.zone ?? row.zone_name ?? zoneHint ?? fallbackZone ?? '') || null;
    const rawDate = row.date ?? row.day ?? row.timestamp ?? row.ts ?? row.from ?? null;
    let date: string | null = null;
    if (typeof rawDate === 'number') date = new Date(rawDate > 1e12 ? rawDate : rawDate * 1000).toISOString().slice(0, 10);
    else if (typeof rawDate === 'string') date = rawDate.slice(0, 10);
    const requests = num(row.requests ?? row.req ?? row.reqs ?? row.calls ?? row.hits);
    const bytes = num(row.bytes ?? row.bw ?? row.bandwidth ?? row.traffic);
    const cost = num(row.cost ?? row.spend ?? row.total_cost ?? row.amount ?? row.price);
    if (requests === null && bytes === null && cost === null) return;
    out.push({
      date,
      zone,
      requests,
      bytes,
      cost,
      label: String(row.type ?? row.product ?? row.description ?? zone ?? 'usage'),
    });
  };

  const walk = (node: unknown, zoneHint?: string) => {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, zoneHint);
      return;
    }
    if (typeof node === 'object') {
      const obj = node as Record<string, unknown>;
      const nested = ['data', 'items', 'usage', 'rows', 'zones', 'result', 'costs'];
      let dove = false;
      for (const key of nested) {
        if (obj[key] && typeof obj[key] === 'object') {
          walk(obj[key], zoneHint);
          dove = true;
        }
      }
      if (!dove) {
        // Keyed maps: { "yad2": {...}, "unlocker": {...} }
        const values = Object.values(obj);
        const allObjects = values.length > 0 && values.every((v) => v && typeof v === 'object' && !Array.isArray(v));
        if (allObjects && !('requests' in obj) && !('cost' in obj) && !('bytes' in obj)) {
          for (const [k, v] of Object.entries(obj)) walk(v, k);
        } else {
          pushRow(obj, zoneHint);
        }
      }
    }
  };

  walk(payload);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization') ?? '';
    const authed = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await authed.auth.getUser();
    if (!userData?.user) return json({ ok: false, error: 'unauthorized' }, 401);

    let days = 30;
    try {
      const body = await req.json();
      const d = Number(body?.days);
      if (Number.isFinite(d) && d > 0 && d <= 180) days = Math.floor(d);
    } catch { /* no body */ }

    const token = (Deno.env.get('BRIGHTDATA_ADMIN_API_TOKEN') ?? Deno.env.get('BRIGHTDATA_API_TOKEN') ?? '').trim();
    if (!token) return json({ ok: false, error: 'missing_token', message: 'Bright Data API token is not configured' });

    const { data: keys } = await authed
      .from('user_api_keys')
      .select('brightdata_zone')
      .eq('user_id', userData.user.id)
      .maybeSingle();
    const zone = (keys?.brightdata_zone ?? Deno.env.get('BRIGHTDATA_UNLOCKER_ZONE') ?? Deno.env.get('BRIGHTDATA_ZONE') ?? 'yad2').trim();

    const to = new Date();
    const from = new Date(to.getTime() - days * 86400000);
    const f = ymd(from);
    const t = ymd(to);

    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
    const endpoints = [
      `https://api.brightdata.com/zone/bw?from=${f}&to=${t}&details=1`,
      `https://api.brightdata.com/zone/bw?zone=${encodeURIComponent(zone)}&from=${f}&to=${t}&details=1`,
      `https://api.brightdata.com/zone/cost?zone=${encodeURIComponent(zone)}&from=${f}&to=${t}`,
      `https://api.brightdata.com/customer/billing/usage?from=${f}&to=${t}`,
      `https://api.brightdata.com/customer/balance/history?from=${f}&to=${t}`,
    ];

    const attempts: Array<{ url: string; status: number | 'network_error'; items: number }> = [];
    let items: LineItem[] = [];
    let usedUrl = '';

    for (const url of endpoints) {
      try {
        const r = await fetch(url, { headers });
        const text = await r.text();
        console.log(`brightdata-usage: GET ${url} -> ${r.status} :: ${text.slice(0, 300)}`);
        let parsed: unknown = null;
        try { parsed = JSON.parse(text); } catch { parsed = null; }
        const normalized = parsed ? normalize(parsed, zone) : [];
        attempts.push({ url, status: r.status, items: normalized.length });
        if (r.ok && normalized.length > 0) {
          items = normalized;
          usedUrl = url;
          break;
        }
      } catch (err) {
        attempts.push({ url, status: 'network_error', items: 0 });
        console.log(`brightdata-usage: ${url} network error ${(err as Error)?.message}`);
      }
    }

    // Local scraping activity so the operator always sees which operations ran,
    // even when the account plan hides the billing API.
    let localOps: Array<{ day: string; kind: string; count: number }> = [];
    try {
      const { data: events } = await authed
        .from('usage_events')
        .select('event_type, created_at')
        .gte('created_at', from.toISOString())
        .limit(2000);
      const bucket = new Map<string, number>();
      for (const e of events ?? []) {
        const day = String((e as any).created_at ?? '').slice(0, 10);
        const kind = String((e as any).event_type ?? 'other');
        const key = `${day}|${kind}`;
        bucket.set(key, (bucket.get(key) ?? 0) + 1);
      }
      localOps = [...bucket.entries()]
        .map(([k, count]) => {
          const [day, kind] = k.split('|');
          return { day, kind, count };
        })
        .sort((a, b) => (a.day < b.day ? 1 : -1));
    } catch { /* non fatal */ }

    const totalCost = items.reduce((s, i) => s + (i.cost ?? 0), 0);
    const totalRequests = items.reduce((s, i) => s + (i.requests ?? 0), 0);
    const totalBytes = items.reduce((s, i) => s + (i.bytes ?? 0), 0);

    return json({
      ok: true,
      zone,
      from: f,
      to: t,
      endpoint: usedUrl || null,
      items,
      totals: { cost: totalCost, requests: totalRequests, bytes: totalBytes },
      local_ops: localOps,
      attempts,
      fetched_at: new Date().toISOString(),
    });
  } catch (e) {
    return json({ ok: false, error: 'unexpected', message: (e as Error)?.message ?? 'error' });
  }
});
