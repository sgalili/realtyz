// Bright Data balance fetcher.
// Returns the remaining credit balance for the caller's Bright Data account.
// Token resolution order: BRIGHTDATA_API_TOKEN secret -> user_api_keys.brightdata_api_token.
// The project secret is authoritative so a stale user row cannot override a rotated token.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

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
    const user = userData?.user;
    if (!user) return json({ ok: false, error: 'unauthorized' }, 401);

    // Account-level (admin/billing) token wins: only it can read the wallet.
    let token = (Deno.env.get('BRIGHTDATA_ADMIN_API_TOKEN') ?? Deno.env.get('BRIGHTDATA_API_TOKEN') ?? '').trim();
    let zone = '';
    const { data: keys } = await authed
      .from('user_api_keys')
      .select('brightdata_api_token, brightdata_zone')
      .eq('user_id', user.id)
      .maybeSingle();
    const userToken = (keys?.brightdata_api_token ?? '').trim();
    zone = (keys?.brightdata_zone ?? '').trim();

    let tokenSource: 'user' | 'project' = 'project';
    if (!token) {
      token = userToken;
      if (token) tokenSource = 'user';
    }
    if (!zone) {
      zone = (Deno.env.get('BRIGHTDATA_UNLOCKER_ZONE') ?? Deno.env.get('BRIGHTDATA_ZONE') ?? 'yad2').trim();
    }
    // Masked hint so the UI can show that a project-level token is active
    // without ever exposing the secret value.
    const maskedToken = token ? `${token.slice(0, 4)}••••${token.slice(-4)}` : '';
    if (!token) {
      return json({ ok: false, error: 'missing_token', zone, token_source: null, message: 'Bright Data API token is not configured' }, 200);
    }

    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    };

    // Bright Data balance endpoints differ by account/API generation.
    // Try the current official endpoint first, then fall back to legacy paths.
    // The token must be sent as a Bearer token in the Authorization header.
    const endpoints = [
      'https://api.brightdata.com/balance',
      'https://api.brightdata.com/customer/balance',
      'https://api.brightdata.com/client/balance',
    ];

    let res: Response | null = null;
    let text = '';
    let usedUrl = '';
    const attempts: Array<{ url: string; status: number | 'network_error'; snippet: string }> = [];

    for (const url of endpoints) {
      try {
        const r = await fetch(url, { method: 'GET', headers });
        const t = await r.text();
        // Always log the exact response so 404s / auth mismatches are diagnosable.
        console.log(`brightdata-balance: GET ${url} -> ${r.status} :: ${t.slice(0, 400)}`);
        attempts.push({ url, status: r.status, snippet: t.slice(0, 200) });
        if (r.ok) {
          res = r;
          text = t;
          usedUrl = url;
          break;
        }
        // 401/403 means the token itself is wrong — no point trying other endpoints.
        if (r.status === 401 || r.status === 403) {
          res = r;
          text = t;
          usedUrl = url;
          break;
        }
      } catch (err) {
        console.log(`brightdata-balance: GET ${url} network error: ${(err as Error)?.message}`);
        attempts.push({ url, status: 'network_error', snippet: (err as Error)?.message ?? '' });
      }
    }

    if (!res) {
      const allNetwork = attempts.every((a) => a.status === 'network_error');
      return json(
        {
          ok: false,
          error: allNetwork ? 'network_error' : 'endpoint_not_found',
          token_source: tokenSource,
          token_masked: maskedToken,
          attempts,
          message: allNetwork
            ? 'Network error reaching Bright Data'
            : 'Bright Data balance endpoint not found (404 on all known endpoints).',
        },
        200,
      );
    }

    if (!res.ok) {
      return json(
        {
          ok: false,
          error: res.status === 401 || res.status === 403 ? 'invalid_token' : 'balance_failed',
          status: res.status,
          endpoint: usedUrl,
          raw: text.slice(0, 300),
          token_source: tokenSource,
          token_masked: maskedToken,
          attempts,
          message: `Bright Data API error (${res.status}). Please check your API token.`,
        },
        200,
      );
    }

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      return json(
        {
          ok: false,
          error: 'balance_failed',
          endpoint: usedUrl,
          raw: text.slice(0, 300),
          token_source: tokenSource,
          token_masked: maskedToken,
          message: 'Bright Data returned an unexpected non-JSON response.',
        },
        200,
      );
    }

    const balance = Number(
      parsed?.balance ?? parsed?.available ?? parsed?.customer_balance ?? parsed?.data?.balance ?? 0,
    );
    const pendingCosts = Number(parsed?.pending_costs ?? parsed?.pending ?? parsed?.data?.pending_costs ?? 0);

    // Optional zone status check (non-fatal).
    let zoneStatus: string | null = null;
    if (zone) {
      try {
        const zRes = await fetch(
          `https://api.brightdata.com/zone?zone=${encodeURIComponent(zone)}`,
          { headers },
        );
        zoneStatus = zRes.ok ? 'active' : `error_${zRes.status}`;
      } catch {
        zoneStatus = null;
      }
    }

    return json({
      ok: true,
      endpoint: usedUrl,
      balance,
      pending_costs: pendingCosts,
      available: balance - pendingCosts,
      currency: 'USD',
      zone: zone || null,
      token_source: tokenSource,
      token_masked: maskedToken,
      zone_status: zoneStatus,
      fetched_at: new Date().toISOString(),
    });
  } catch (e) {
    return json({ ok: false, error: 'unexpected', message: (e as Error)?.message ?? 'error' }, 200);
  }
});
