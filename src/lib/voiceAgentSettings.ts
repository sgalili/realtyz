import { z } from 'zod';

export const DEFAULT_AGENT_VOICE = 't1FxSQNdBrLMfytJMHmg';
export const voiceAgentSettingsSchema = z.object({
  availability: z.enum(['available', 'away']),
  elevenlabs_voice_id: z.string().trim().min(1),
  language: z.enum(['he', 'en']),
  elevenlabs_phone_number: z.string().trim().refine(v => !v || /^\+?[1-9]\d{7,14}$/.test(v), 'יש להזין מספר בינלאומי, למשל ‎+972…'),
  greeting: z.string().trim().max(2000),
}).strict();
export type VoiceAgentSettings = z.infer<typeof voiceAgentSettingsSchema>;

export function voiceAgentConversation(settings: VoiceAgentSettings, name: string, prompt: string) {
  return {
    agent: {
      prompt: { prompt: `${prompt}\nSpeak only ${settings.language === 'he' ? 'Hebrew' : 'English'}. Ask one concise question at a time. Do not claim to perform actions without a successful tool result. If a callback is needed, collect the request verbally; there is no live callback tool.` },
      language: settings.language,
      first_message: settings.greeting || (settings.language === 'he'
        ? `שלום, אני ריטה, סוכנת ה-AI של ${name}. איך אפשר לעזור?`
        : `Hello, I'm Rita, the AI agent for ${name}. How can I help?`),
    },
    tts: { voice_id: settings.elevenlabs_voice_id, model_id: 'eleven_v3_conversational' },
  };
}

export async function boundedVoiceRequest<T>(request: PromiseLike<T>, milliseconds = 20000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([Promise.resolve(request), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('הבקשה נמשכת זמן רב. יש לרענן ולבדוק את המצב לפני ניסיון נוסף.')), milliseconds);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}