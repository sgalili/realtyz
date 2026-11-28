import { z } from 'zod';

// A minimal greeting using Rita's current voice/model was rejected at 4 credits,
// with ElevenLabs reporting that 5 were required. This is only a startup floor,
// not an estimate or guarantee for the cost of a complete conversation.
export const RITA_MINIMUM_STARTUP_CREDITS = 5;
const subscriptionSchema = z.object({
  character_count: z.number().nonnegative(),
  character_limit: z.number().nonnegative(),
  can_extend_character_limit: z.boolean(),
});

export async function requireRitaStartupBalance(key: string): Promise<void> {
  const response = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
    headers: { 'xi-api-key': key },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    const body = await response.text();
    console.error('ElevenLabs balance check failed', response.status, body.slice(0, 1500));
    throw new Error(`ElevenLabs: לא ניתן לבדוק את היתרה לפני החיוג (${response.status})`);
  }
  const result = subscriptionSchema.safeParse(await response.json());
  if (!result.success) throw new Error('ElevenLabs: בדיקת היתרה לא החזירה נתונים תקינים; לא בוצע חיוג');
  const remaining = Math.max(0, result.data.character_limit - result.data.character_count);
  if (remaining < RITA_MINIMUM_STARTUP_CREDITS && !result.data.can_extend_character_limit) {
    throw new Error(`היתרה ב-ElevenLabs אינה מספיקה לפתיחת שיחת קול (${remaining} קרדיטים). יש להוסיף קרדיטים בחשבון ElevenLabs לפני ניסיון נוסף. לא בוצע חיוג.`);
  }
}