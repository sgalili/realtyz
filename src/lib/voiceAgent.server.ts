import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { boundedVoiceRequest } from './voiceAgentSettings';

type Row = Database['public']['Tables']['voice_agents']['Row'];
type Phone = { phone_number_id: string; phone_number: string; assigned_agent?: { agent_id: string } | null };
type Agent = { agent_id?: string; tags?: string[]; conversation_config?: { agent?: { language?: string; first_message?: string }; tts?: { voice_id?: string } } };

function requireAgentOwner(agent: Agent, userId: string) {
  if (!agent.tags?.includes(`toraff-owner:${userId}`)) throw new Error('שיוך הסוכן לחשבון לא אומת. לא שונו הגדרות הספק.');
}

async function elevenRequest<T>(key: string, path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`https://api.elevenlabs.io/v1${path}`, {
    method, headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const detail = await response.text();
    console.error('ElevenLabs configuration request failed', response.status, detail);
    throw new Error(`ElevenLabs ${response.status}: ${detail.slice(0, 500)}`);
  }
  return response.json() as Promise<T>;
}

const phoneDigits = (phone: string) => phone.replace(/\D/g, '');
async function savedPhone(key: string, number: string) {
  const phones = await elevenRequest<Phone[]>(key, '/convai/phone-numbers');
  return phones.find(p => phoneDigits(p.phone_number) === phoneDigits(number));
}

export async function inspectVoiceConnection(row: Row | null, userId: string, key?: string) {
  if (!key) return { connected: false, agentVerified: false, settingsMatch: false, phoneState: 'unset', message: 'ElevenLabs אינו מחובר לפרויקט' };
  try {
    // A read-only probe: never create an agent or expose other agents/numbers.
    let agent: Agent | null = null;
    if (row?.elevenlabs_agent_id) agent = await elevenRequest<Agent>(key, `/convai/agents/${encodeURIComponent(row.elevenlabs_agent_id)}`);
    else await elevenRequest(key, '/convai/agents?page_size=1');
    if (agent) requireAgentOwner(agent, userId);
    const phone = row?.elevenlabs_phone_number ? await savedPhone(key, row.elevenlabs_phone_number) : null;
    const cfg = agent?.conversation_config;
    return {
      connected: true, agentVerified: !!agent,
      settingsMatch: !!row?.last_synced_at && cfg?.agent?.language === row.language && cfg?.tts?.voice_id === row.elevenlabs_voice_id && (!row.greeting || cfg?.agent?.first_message === row.greeting),
      phoneState: !row?.elevenlabs_phone_number ? 'unset' : !phone ? 'not_imported' : phone.assigned_agent?.agent_id === row.elevenlabs_agent_id ? 'assigned' : phone.assigned_agent?.agent_id ? 'other_agent' : 'unassigned',
      message: agent ? 'הסוכן נמצא ב-ElevenLabs' : 'ElevenLabs מחובר. הסוכן עדיין לא הוגדר',
    };
  } catch (error) {
    return { connected: false, agentVerified: false, settingsMatch: false, phoneState: 'unknown', message: error instanceof Error ? error.message : 'בדיקת ElevenLabs נכשלה' };
  }
}

export async function syncElevenLabsAgent(client: SupabaseClient<Database>, userId: string, row: Row, config: unknown, name: string, key: string, bindPhone: boolean) {
  // Resolve only the configured number; never reassign another agent's line.
  const phone = bindPhone && row.elevenlabs_phone_number ? await savedPhone(key, row.elevenlabs_phone_number) : null;
  if (bindPhone && (!phone || (phone.assigned_agent?.agent_id && phone.assigned_agent.agent_id !== row.elevenlabs_agent_id))) throw new Error('המספר אינו מיובא ל-ElevenLabs או משויך לסוכן אחר. לא שונה ניתוב השיחות.');
  let agentId = row.elevenlabs_agent_id;
  if (agentId) requireAgentOwner(await elevenRequest<Agent>(key, `/convai/agents/${encodeURIComponent(agentId)}`), userId);
  const result = await elevenRequest<Agent>(key, agentId ? `/convai/agents/${encodeURIComponent(agentId)}` : '/convai/agents/create', agentId ? 'PATCH' : 'POST', { name: `TORAFF · ${name}`, conversation_config: config, tags: [`toraff-owner:${userId}`] });
  agentId = agentId || result.agent_id || null;
  if (!agentId) throw new Error('ElevenLabs לא החזיר מזהה סוכן. יש לבדוק את מצב הספק לפני ניסיון נוסף.');
  // Persist the ID before optional phone binding. Never blindly recreate after an ambiguous outcome.
  const { data: saved, error } = await boundedVoiceRequest(client.from('voice_agents').update({ elevenlabs_agent_id: agentId, last_synced_at: new Date().toISOString() }).eq('user_id', userId).eq('updated_at', row.updated_at).select('*').single());
  if (error) throw new Error('הסוכן עודכן אצל ElevenLabs אך אישור השמירה נכשל או שההגדרות השתנו. יש לרענן ולבדוק את הספק לפני ניסיון נוסף.');
  if (phone) {
    await elevenRequest(key, `/convai/phone-numbers/${encodeURIComponent(phone.phone_number_id)}`, 'PATCH', { agent_id: agentId });
    const verified = await savedPhone(key, row.elevenlabs_phone_number || '');
    if (verified?.assigned_agent?.agent_id !== agentId) throw new Error('הסוכן סונכרן, אך שיוך המספר לא אומת. יש לבדוק את ניתוב השיחות ב-ElevenLabs.');
  }
  return saved;
}