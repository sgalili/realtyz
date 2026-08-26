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

    if (!token) token = (Deno.env.get('BRIGHTDATA_API_TOKEN') ?? '').trim();
    if (!zone) zone = (Deno.env.get('BRIGHTDATA_ZONE') ?? '').trim();
    if (!token) return json({ ok: false, error: 'missing_token', message: 'Bright Data API token is not configured' }, 400);

    const headers = { Authorization: `Bearer ${token}` };

    const balanceRes = await fetch('https://api.brightdata.com/customer/balance', { headers });
    const balanceText = await balanceRes.text();
    if (!balanceRes.ok) {
      return json(
        {
          ok: false,
          error: balanceRes.status === 401 || balanceRes.status === 403 ? 'invalid_token' : 'balance_failed',
          status: balanceRes.status,
          message: balanceText.slice(0, 300),
        },
        200,
      );
    }

    let parsed: any = {};
    try { parsed = JSON.parse(balanceText); } catch { parsed = {}; }

    const balance = Number(parsed?.balance ?? parsed?.available ?? 0);
    const pendingCosts = Number(parsed?.pending_costs ?? 0);

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
      zone_status: zoneStatus,
      fetched_at: new Date().toISOString(),
    });
  } catch (e) {
    return json({ ok: false, error: 'unexpected', message: (e as Error)?.message ?? 'error' }, 200);
  }
});
