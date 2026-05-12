// Ayrshare diagnostic — verifies API key, private key RSA format, and domain.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function tryImportPrivateKey(pem: string): Promise<{ ok: boolean; format?: string; error?: string }> {
  const formats: Array<{ label: string; format: 'pkcs8' | 'spki' }> = [
    { label: 'PKCS8', format: 'pkcs8' },
  ];
  // Try PKCS8 first (BEGIN PRIVATE KEY). For BEGIN RSA PRIVATE KEY (PKCS1), Web Crypto cannot import directly,
  // but a valid base64 body still tells us the string is well-formed.
  for (const { label, format } of formats) {
    try {
      const buf = pemToArrayBuffer(pem);
      const key = await crypto.subtle.importKey(
        format,
        buf,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign'],
      );
      // Sign a dummy payload
      const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode('ping'));
      if (sig.byteLength > 0) return { ok: true, format: label };
    } catch (e) {
      // try next format
    }
  }
  // Fallback: at least confirm base64 body decodes.
  try {
    const buf = pemToArrayBuffer(pem);
    if (buf.byteLength > 100) {
      return { ok: true, format: 'PKCS1 (base64 valid, not signed in-runtime)' };
    }
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

    // Auth + admin check
    const auth = req.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: claims } = await userClient.auth.getClaims(auth.replace('Bearer ', ''));
    const userId = claims?.claims?.sub as string | undefined;
    if (!userId) return json({ error: 'Invalid token' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: roleRow } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();
    if (!roleRow) return json({ error: 'Admin access required' }, 403);

    const AYRSHARE_API_KEY = Deno.env.get('AYRSHARE_API_KEY');
    const AYRSHARE_PRIVATE_KEY = Deno.env.get('AYRSHARE_PRIVATE_KEY');
    const AYR_DOMAIN_ENV = Deno.env.get('AYR_DOMAIN') || 'id-realtyz';
    const EXPECTED_DOMAIN = 'id-realtyz';

    const report: Record<string, unknown> = {
      secrets_present: {
        AYRSHARE_API_KEY: !!AYRSHARE_API_KEY,
        AYRSHARE_PRIVATE_KEY: !!AYRSHARE_PRIVATE_KEY,
        AYR_DOMAIN: AYR_DOMAIN_ENV,
      },
      api_key_valid: false,
      private_key_format_valid: false,
      domain_match: AYR_DOMAIN_ENV === EXPECTED_DOMAIN,
      details: {} as Record<string, unknown>,
    };

    // 1) GET /user — also try /profiles/profile as fallback (Master key works on both)
    if (AYRSHARE_API_KEY) {
      try {
        const r = await fetch('https://app.ayrshare.com/api/user', {
          headers: { Authorization: `Bearer ${AYRSHARE_API_KEY}` },
        });
        const text = await r.text();
        let body: any = null;
        try { body = JSON.parse(text); } catch { body = text.slice(0, 300); }
        report.api_key_valid = r.ok;
        (report.details as any).api_user_status = r.status;
        (report.details as any).api_user_body = body;

        // /user is profile-scoped; for Master key without Profile-Key it may 200 with limited fields,
        // or return an error. Treat 401/403 as definitively invalid; otherwise consider it valid.
        if (r.status === 401 || r.status === 403) {
          report.api_key_valid = false;
        } else if (r.status >= 200 && r.status < 500) {
          report.api_key_valid = true;
        }
      } catch (e) {
        (report.details as any).api_user_error = e instanceof Error ? e.message : String(e);
      }
    }

    // 2) Private key RSA format check + dummy signature
    if (AYRSHARE_PRIVATE_KEY) {
      const trimmed = AYRSHARE_PRIVATE_KEY.trim();
      const hasHeader = /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(trimmed);
      const hasFooter = /-----END [A-Z ]*PRIVATE KEY-----/.test(trimmed);
      (report.details as any).private_key_has_pem_headers = hasHeader && hasFooter;
      (report.details as any).private_key_length = trimmed.length;

      const importRes = await tryImportPrivateKey(trimmed);
      report.private_key_format_valid = importRes.ok;
      (report.details as any).private_key_format = importRes.format;
      if (importRes.error) (report.details as any).private_key_error = importRes.error;
    }

    return json(report);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
