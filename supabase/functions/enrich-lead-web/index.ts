// Enrich a lead by scanning public web + social sources using Lovable AI Gateway.
// Returns structured "findings" for the CRM dialog to review + apply. No writes here.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Finding = {
  key: string;
  label: string;
  value: string;
  source?: string;
  target: 'column' | 'preference' | 'social';
  column?: string;
  platform?: string;
};

function inferGenderFromHebrewFirstName(fullName?: string | null): 'male' | 'female' | null {
  const first = String(fullName || '').trim().split(/\s+/)[0];
  if (!first) return null;
  const male = new Set(['ירון','יוסי','יוסף','משה','דוד','אבי','אברהם','איתן','אייל','אלון','אמיר','אריאל','בנימין','גיא','דניאל','דן','דרור','הראל','חיים','טל','יניב','יעקב','ליאור','מיכאל','נועם','עדי','עומר','רון','רועי','שי','תומר']);
  const female = new Set(['שרה','מיכל','יעל','נועה','דנה','רונית','אורית','ליאת','עדי','שירה','מאיה','רחל','חנה','מרים','ענת','הילה','גלית','איילת','קרן','לימור','סיון','אפרת','טלי','תמר','נעמה','רוני']);
  if (male.has(first)) return 'male';
  if (female.has(first)) return 'female';
  return null;
}

const SYSTEM = `You are a real-estate CRM enrichment agent. Given basic contact info,
research public web sources and social networks (Facebook, Instagram, LinkedIn, X/Twitter, TikTok, YouTube)
to enrich the profile. Return ONLY facts you are confident about. If unsure, omit the field.
Respond strictly in JSON with this shape:
{
  "summary": "1-2 sentence Hebrew summary of what you found",
  "findings": [
    { "key": "age", "label": "גיל", "value": "42", "source": "linkedin.com/in/...", "target": "preference" },
    { "key": "gender", "label": "מגדר", "value": "male", "source": "name/social profile", "target": "preference" },
    { "key": "city", "label": "עיר", "value": "תל אביב", "source": "facebook profile", "target": "column", "column": "city" },
    { "key": "email", "label": "דוא״ל", "value": "x@y.com", "source": "website", "target": "column", "column": "email" },
    { "key": "linkedin_url", "label": "LinkedIn", "value": "https://linkedin.com/in/...", "target": "preference" },
    { "key": "social_facebook", "label": "Facebook", "value": "https://facebook.com/...", "target": "social", "platform": "facebook" },
    { "key": "social_instagram", "label": "Instagram", "value": "@handle", "target": "social", "platform": "instagram" }
  ]
}

For gender, infer only when there is a strong signal from public profile text,
pronouns, Hebrew first name, or explicit profile information. Return exactly one
of: "male", "female", "other". Never return Hebrew words for gender.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { lead_id } = await req.json().catch(() => ({}));
    if (!lead_id) {
      return new Response(JSON.stringify({ error: 'lead_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .select('id, full_name, email, phone_number, city, address, instagram_handle, telegram_username, preferences')
      .eq('id', lead_id)
      .maybeSingle();
    if (leadErr || !lead) {
      return new Response(JSON.stringify({ error: 'lead not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI gateway not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const prefs = (lead.preferences ?? {}) as any;
    const contextLines = [
      `Full name: ${lead.full_name ?? '(unknown)'}`,
      `Phone: ${lead.phone_number ?? '(unknown)'}`,
      `Email: ${lead.email ?? '(unknown)'}`,
      `City: ${lead.city ?? '(unknown)'}`,
      `Address: ${lead.address ?? '(unknown)'}`,
      `Instagram: ${lead.instagram_handle ?? '(unknown)'}`,
      `Telegram: ${lead.telegram_username ?? '(unknown)'}`,
      prefs.facebook_url ? `Facebook: ${prefs.facebook_url}` : '',
      prefs.linkedin_url ? `LinkedIn: ${prefs.linkedin_url}` : '',
      Array.isArray(prefs.socials) && prefs.socials.length ? `Socials: ${JSON.stringify(prefs.socials).slice(0, 1200)}` : '',
    ].filter(Boolean).join('\n');

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: `Research this contact and return enrichment findings. Prefer Israeli sources. Contact:\n${contextLines}` },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!aiRes.ok) {
      const details = await aiRes.text();
      console.error('[enrich-lead-web] AI gateway failed', aiRes.status, details);
      return new Response(JSON.stringify({ error: 'AI request failed', status: aiRes.status, details }), {
        status: aiRes.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiJson = await aiRes.json();
    const raw = aiJson?.choices?.[0]?.message?.content ?? '{}';
    let parsed: { summary?: string; findings?: Finding[] } = {};
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }

    // Filter out findings that match what's already stored, so the dialog only
    // proposes real deltas.
    const existing: Record<string, string | undefined> = {
      email: lead.email ?? undefined,
      city: lead.city ?? undefined,
      address: lead.address ?? undefined,
      instagram_handle: lead.instagram_handle ?? undefined,
      age: prefs.age ? String(prefs.age) : undefined,
      gender: prefs.gender,
      facebook_url: prefs.facebook_url,
      linkedin_url: prefs.linkedin_url,
    };
    const normalizeGender = (value: string) => {
      const v = String(value || '').trim().toLowerCase();
      if (['male', 'm', 'man', 'זכר', 'גבר'].includes(v)) return 'male';
      if (['female', 'f', 'woman', 'נקבה', 'אישה', 'אשה'].includes(v)) return 'female';
      if (['other', 'unknown', 'אחר', 'אחרת'].includes(v)) return 'other';
      return value;
    };
    const normalizedFindings = (parsed.findings ?? []).map((f) => {
      if (f?.key === 'gender') return { ...f, value: normalizeGender(f.value), target: 'preference' as const };
      return f;
    });

    if (!existing.gender && !normalizedFindings.some((f) => f?.key === 'gender')) {
      const inferred = inferGenderFromHebrewFirstName(lead.full_name);
      if (inferred) {
        normalizedFindings.push({
          key: 'gender',
          label: 'מגדר',
          value: inferred,
          source: 'שם פרטי',
          target: 'preference',
        });
      }
    }

    const findings = normalizedFindings.filter((f) => {
      if (!f?.value) return false;
      if (f.key === 'gender' && !['male', 'female', 'other'].includes(String(f.value))) return false;
      const cur = existing[f.column ?? f.key];
      return !cur || cur.toString().trim().toLowerCase() !== String(f.value).trim().toLowerCase();
    });

    return new Response(JSON.stringify({ success: true, summary: parsed.summary ?? '', findings }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[enrich-lead-web] error', e);
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
