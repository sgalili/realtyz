// Bright Data balance fetcher.
// Returns the remaining credit balance for the caller's Bright Data account.
// Token resolution order: user_api_keys.brightdata_api_token -> BRIGHTDATA_API_TOKEN secret.
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

    let token = '';
    let zone = '';
    const { data: keys } = await authed
      .from('user_api_keys')
      .select('brightdata_api_token, brightdata_zone')
      .eq('user_id', user.id)
      .maybeSingle();
    token = (keys?.brightdata_api_token ?? '').trim();
    zone = (keys?.brightdata_zone ?? '').trim();

    let tokenSource: 'user' | 'project' = 'user';
    if (!token) {
      token = (Deno.env.get('BRIGHTDATA_API_TOKEN') ?? '').trim();
      if (token) tokenSource = 'project';
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

    // Bright Data exposes the account balance on the official customer endpoint.
    // The token must be sent as a Bearer token in the Authorization header.
    // We try the canonical route first, then a couple of legacy aliases.
    const endpoints = [
      'https://api.brightdata.com/client/balance',
      'https://api.brightdata.com/customer/balance',
      'https://api.brightdata.com/dca/customer/balance',
    ];

    let parsed: any = null;
    let lastStatus = 0;
    let lastBody = '';

    for (const url of endpoints) {
      let res: Response;
      try {
        res = await fetch(url, { method: 'GET', headers });
      } catch (err) {
        lastBody = (err as Error)?.message ?? 'network_error';
        continue;
      }
      const text = await res.text();
      lastStatus = res.status;
      lastBody = text;
      if (!res.ok) continue;
      try {
        const body = JSON.parse(text);
        const candidate = body?.balance ?? body?.available ?? body?.customer_balance ?? body?.data?.balance;
        if (candidate !== undefined && candidate !== null && Number.isFinite(Number(candidate))) {
          parsed = body;
          break;
        }
        // Valid JSON but unexpected shape — keep it as a weak fallback.
        if (!parsed) parsed = body;
      } catch {
        // not JSON, try the next endpoint
      }
    }

    if (!parsed) {
      return json(
        {
          ok: false,
          error: lastStatus === 401 || lastStatus === 403 ? 'invalid_token' : 'balance_failed',
          status: lastStatus,
          token_source: tokenSource,
          token_masked: maskedToken,
          message: String(lastBody).slice(0, 300),
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
