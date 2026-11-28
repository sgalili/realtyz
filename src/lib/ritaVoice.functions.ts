import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

function failure(error: unknown): Response {
  const message = error instanceof Error ? error.message : 'Request failed';
  const status = message === 'Unauthorized' || message === 'Agent mismatch' ? 401 : message.includes('Invalid') || message.includes('Missing') || (error instanceof Error && (error.name === 'ZodError' || error.name === 'SyntaxError')) ? 400 : 500;
  return Response.json({ error: status < 500 ? message : 'Rita request failed' }, { status });
}

export const startRitaCall = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { startRitaOutboundCall } = await import('./ritaVoiceOutbound.server');
    return startRitaOutboundCall({ admin: supabaseAdmin, userClient: context.supabase, userId: context.userId, rawInput: data });
  });

export const configureRitaVoiceIntegration = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data: allowed, error } = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'super_admin' });
  if (error || !allowed) throw new Error('הגדרת החיבור המרכזי זמינה למנהל המערכת בלבד');
  const key = process.env['ELEVENLABS_API_KEY'];
  if (!key) throw new Error('ElevenLabs אינו מחובר לפרויקט');
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { configureRitaProvider } = await import('./ritaVoiceProvider.server');
  return configureRitaProvider(supabaseAdmin, key, process.env['PUBLIC_SITE_URL'] || 'https://toraff.co.il', context.userId);
});

export async function handleRitaOutboundRequest(request: Request): Promise<Response> {
  try {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { requireServiceBearer } = await import('./ritaVoiceSecurity.server');
    requireServiceBearer(request);
    const { startRitaOutboundCall } = await import('./ritaVoiceOutbound.server');
    const input = await request.json();
    const result = await startRitaOutboundCall({ admin: supabaseAdmin, userClient: supabaseAdmin, userId: null, rawInput: input, service: true });
    return Response.json(result);
  } catch (error) { return failure(error); }
}

export async function handleRitaPropertySearchRequest(request: Request): Promise<Response> {
  try {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { requireRitaCallbackSecret } = await import('./ritaVoiceSecurity.server');
    await requireRitaCallbackSecret(request, supabaseAdmin);
    const { searchRitaProperties } = await import('./ritaVoiceSearch.server');
    return Response.json(await searchRitaProperties(supabaseAdmin, await request.json()));
  } catch (error) { return failure(error); }
}

export async function handleRitaConversationInitiationRequest(request: Request): Promise<Response> {
  try {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { requireRitaCallbackSecret } = await import('./ritaVoiceSecurity.server');
    await requireRitaCallbackSecret(request, supabaseAdmin);
    const { handleRitaConversationInitiation } = await import('./ritaVoiceWebhook.server');
    return Response.json(await handleRitaConversationInitiation(supabaseAdmin, await request.json()));
  } catch (error) { return failure(error); }
}

export async function handleRitaPostCallRequest(request: Request): Promise<Response> {
  try {
    const rawBody = await request.text();
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { handleRitaPostCall } = await import('./ritaVoiceWebhook.server');
    return Response.json(await handleRitaPostCall(supabaseAdmin, rawBody, request.headers.get('elevenlabs-signature')));
  } catch (error) { return failure(error); }
}
