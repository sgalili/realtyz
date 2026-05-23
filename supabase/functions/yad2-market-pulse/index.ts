// Pipeline B — Yad2 Market Pulse via public RSS feeds per city.
// Cached for 30 minutes in `market_pulse_cache`.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

// City -> Yad2 RSS endpoint. Yad2 exposes simple RSS for forsale feeds.
// We restrict to the broker's core territory.
const CITY_FEEDS: Record<string, string> = {
  'הרצליה': 'https://www.yad2.co.il/realestate/forsale/rss?city=6400',
  'רמת השרון': 'https://www.yad2.co.il/realestate/forsale/rss?city=2620',
  'כפר שמריהו': 'https://www.yad2.co.il/realestate/forsale/rss?city=1140',
};

const CACHE_TTL_MS = 30 * 60 * 1000;

function parseRss(xml: string) {
  const items: Array<{ title: string; link: string; description: string; pubDate: string }> = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const body = m[1];
    const pick = (tag: string) => {
      const r = new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`).exec(body);
      return r ? r[1].trim() : '';
    };
    items.push({
      title: pick('title'),
      link: pick('link'),
      description: pick('description'),
      pubDate: pick('pubDate'),
    });
  }
  return items;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const result: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  for (const [city, url] of Object.entries(CITY_FEEDS)) {
    const cacheKey = city;
    const { data: cached } = await admin
      .from('market_pulse_cache')
      .select('payload, expires_at')
      .eq('source', 'yad2')
      .eq('cache_key', cacheKey)
      .maybeSingle();

    if (cached && new Date(cached.expires_at) > new Date()) {
      result[city] = cached.payload;
      continue;
    }

    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'RealtyzAI/1.0 (+market-pulse)' },
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) {
        errors[city] = `HTTP ${r.status}`;
        continue;
      }
      const xml = await r.text();
      const items = parseRss(xml).slice(0, 20);
      const payload = { items, fetched_at: new Date().toISOString() };
      result[city] = payload;
      await admin.from('market_pulse_cache').upsert({
        source: 'yad2',
        cache_key: cacheKey,
        payload,
        fetched_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
      }, { onConflict: 'source,cache_key' });
    } catch (e) {
      errors[city] = (e as Error).message;
    }
  }

  return new Response(JSON.stringify({ success: true, cities: result, errors }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  });
});
