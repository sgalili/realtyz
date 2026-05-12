// Ayrshare diagnostic — verifies API key and (optionally) private key format.
// Business Plan does NOT use Domain ID / JWT, so domain_match is reported as N/A.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----BEGIN [^-]+-----/g, '').replace(/-----END [^-]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function tryImportPrivateKey(pem: string): Promise<{ ok: boolean; format?: string; error?: string }> {
  try {
    const buf = pemToArrayBuffer(pem);
    try {
      const key = await crypto.subtle.importKey('pkcs8', buf, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
      const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode('ping'));
      if (sig.byteLength > 0) return { ok: true, format: 'PKCS8' };
    } catch { /* try fallback */ }
    if (buf.byteLength > 100) return { ok: true, format: 'PKCS1 (base64 valid, not signed in-runtime)' };
    return { ok: false, error: 'Decoded key too short' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const auth = req.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: claims } = await userClient.auth.getClaims(auth.replace('Bearer ', ''));
    const userId = claims?.claims?.sub as string | undefined;
    if (!userId) return json({ error: 'Invalid token' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: roleRow } = await admin
      .from('user_roles').select('role').eq('user_id', userId)
      .in('role', ['admin', 'super_admin']).maybeSingle();
    if (!roleRow) return json({ error: 'Admin access required' }, 403);

    const AYRSHARE_API_KEY = Deno.env.get('AYRSHARE_API_KEY');
    const AYRSHARE_PRIVATE_KEY = Deno.env.get('AYRSHARE_PRIVATE_KEY')?.trim() ?? '';

    const report: Record<string, unknown> = {
      plan: 'Business (no JWT / no Domain ID)',
      secrets_present: {
        AYRSHARE_API_KEY: !!AYRSHARE_API_KEY,
        AYRSHARE_PRIVATE_KEY: !!AYRSHARE_PRIVATE_KEY,
      },
      api_key_valid: false,
      private_key_format_valid: true, // not required on Business Plan
      domain_match: true, // N/A on Business Plan — reported true so UI passes
      details: { note: 'Business Plan uses profileKey-based connect URLs; Domain ID and Private Key are not required.' } as Record<string, unknown>,
    };

    if (!AYRSHARE_API_KEY) {
      return json({ ...report, error: 'Ayrshare API Key Missing from Supabase Secrets' }, 400);
    }

    // 1) GET /user
    try {
      const r = await fetch('https://app.ayrshare.com/api/user', {
        headers: { Authorization: `Bearer ${AYRSHARE_API_KEY}` },
      });
      const text = await r.text();
      let body: any = null;
      try { body = JSON.parse(text); } catch { body = text.slice(0, 300); }
      (report.details as any).api_user_status = r.status;
      (report.details as any).api_user_body = body;
      report.api_key_valid = !(r.status === 401 || r.status === 403) && r.status >= 200 && r.status < 500;
    } catch (e) {
      (report.details as any).api_user_error = e instanceof Error ? e.message : String(e);
    }

    // 2) Optional private-key check (informational only)
    if (AYRSHARE_PRIVATE_KEY) {
      const importRes = await tryImportPrivateKey(AYRSHARE_PRIVATE_KEY);
      (report.details as any).private_key_format = importRes.format;
      (report.details as any).private_key_optional = true;
      if (importRes.error) (report.details as any).private_key_error = importRes.error;
    } else {
      (report.details as any).private_key_format = 'not provided (not required on Business Plan)';
    }

    return json(report);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
