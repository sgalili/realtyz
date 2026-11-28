import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

export type RitaAdmin = SupabaseClient<Database>;
export type RitaRuntime = Database['public']['Tables']['rita_voice_runtime']['Row'];

export async function getRitaRuntime(admin: RitaAdmin): Promise<RitaRuntime> {
  const { data, error } = await admin.from('rita_voice_runtime').select('*').eq('id', true).single();
  if (error || !data) throw new Error('תצורת סוכן הקול של ריטה אינה זמינה');
  return data;
}

export function equalSecret(received: string, expected: string): boolean {
  if (!received || !expected) return false;
  const left = createHash('sha256').update(received).digest();
  const right = createHash('sha256').update(expected).digest();
  return timingSafeEqual(left, right);
}

export async function requireRitaCallbackSecret(request: Request, admin: RitaAdmin): Promise<RitaRuntime> {
  const runtime = await getRitaRuntime(admin);
  const received = request.headers.get('x-rita-key') ?? '';
  if (!runtime.webhook_secret || !equalSecret(received, runtime.webhook_secret)) throw new Error('Unauthorized');
  return runtime;
}

export function verifyElevenLabsPostCallSignature(rawBody: string, header: string | null, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  if (!header || !secret) return false;
  const parts = new Map(header.split(',').map(part => {
    const index = part.indexOf('=');
    return [part.slice(0, index), part.slice(index + 1)] as const;
  }));
  const timestamp = Number(parts.get('t'));
  const signature = parts.get('v0') ?? '';
  if (!Number.isFinite(timestamp) || Math.abs(nowSeconds - timestamp) > 300 || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');
  return equalSecret(signature.toLowerCase(), expected);
}

export function requireServiceBearer(request: Request): void {
  const expected = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '';
  const received = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (!expected || !equalSecret(received, expected)) throw new Error('Unauthorized');
}
