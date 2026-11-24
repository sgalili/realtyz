import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { convertToModelMessages } from 'npm:ai@7';
import { createResponsesCall } from './responses.ts';
import { visitorBody, visitorPrompt } from './policy.ts';

const json = (message: string, status: number) => new Response(JSON.stringify({ error: message }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

/** Intentionally public: no database client, private context, tools or privileged dispatch. */
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json('הבקשה אינה נתמכת', 405);
  try {
    const raw = await req.text();
    if (raw.length > 40_000) return json('השיחה ארוכה מדי. התחילו שיחה חדשה.', 400);
    const parsed = visitorBody.safeParse(JSON.parse(raw));
    if (!parsed.success) return json('ניתן לשלוח לריטה הודעות טקסט בלבד.', 400);
    const key = Deno.env.get('LOVABLE_API_KEY');
    if (!key) return json('ריטה אינה זמינה כרגע. ניתן להמשיך להרשמה.', 503);
    const messages = parsed.data.messages;
    const call = createResponsesCall(req, { baseURL: 'https://ai.gateway.lovable.dev/v1', apiKey: key, model: 'openai/gpt-6-astra' }, await convertToModelMessages(messages), visitorPrompt(parsed.data.presentation));
    return call.response(messages, corsHeaders);
  } catch {
    return json('לא ניתן לפתוח את השיחה כרגע. נסו שוב מאוחר יותר.', 400);
  }
});