import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/integrations/supabase/types';
import { RITA_TEST_MAX_SECONDS, normalizeRitaGender, buildRitaDynamicVariables, firstNameFromFullName, propertyContextFromListing, ritaOutboundInputSchema, ritaPhoneE164, ritaOpeningGreeting, ritaProviderVariables, type RitaDynamicVariables, type RitaCallRole } from './ritaVoice';
import { ritaPronunciationLocators } from './ritaHebrewSpeech';
import { getRitaRuntime, type RitaAdmin } from './ritaVoiceSecurity.server';

const LEAD_COLUMNS = 'id,full_name,phone_number,workspace_owner_id,linked_listing_id,deal_type,city,preferences';
const PROPERTY_COLUMNS = 'id,property_title,address,city,neighborhood,rooms,asking_price,deal_type,workspace_owner_id';

type Client = SupabaseClient<Database>;
type ResolvedContext = {
  workspaceId: string | null;
  leadId: string | null;
  propertyId: string | null;
  fullName: string;
  phone: string;
  agencyName: string;
  agentName: string;
  property: ReturnType<typeof propertyContextFromListing>;
  gender?: string | null;
};

async function profileGender(admin: RitaAdmin, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { data } = await admin.from('profiles').select('gender').eq('id', userId).maybeSingle();
  return (data as { gender?: string | null } | null)?.gender ?? null;
}

function json(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

async function identity(admin: RitaAdmin, workspaceId: string | null) {
  if (!workspaceId) return { agencyName: 'TORAFF', agentName: 'TORAFF' };
  const [{ data: profile, error: profileError }, { data: brand, error: brandError }] = await Promise.all([
    admin.from('profiles').select('full_name,broker_byline').eq('id', workspaceId).maybeSingle(),
    admin.from('white_label_settings').select('agency_name').eq('user_id', workspaceId).maybeSingle(),
  ]);
  if (profileError || brandError) throw new Error('לא ניתן לטעון את זהות המשרד לשיחה');
  const agentName = profile?.broker_byline?.trim() || profile?.full_name?.trim() || 'TORAFF';
  return { agencyName: brand?.agency_name?.trim() || agentName, agentName };
}

export async function resolveLeadCallContext(admin: RitaAdmin, leadId: string, requestedPropertyId?: string | null): Promise<ResolvedContext> {
  const { data: lead, error } = await admin.from('leads').select(LEAD_COLUMNS).eq('id', leadId).maybeSingle();
  if (error || !lead) throw new Error('הליד לא נמצא');
  const workspaceId = lead.workspace_owner_id;
  if (!workspaceId) throw new Error('הליד אינו משויך למרחב עבודה');
  const propertyId = requestedPropertyId || lead.linked_listing_id || null;
  let property: ReturnType<typeof propertyContextFromListing> = {};
  if (propertyId) {
    const { data: listing, error: listingError } = await admin.from('listings').select(PROPERTY_COLUMNS).eq('id', propertyId).eq('workspace_owner_id', workspaceId).maybeSingle();
    if (listingError) throw listingError;
    if (!listing) throw new Error('הנכס אינו שייך למרחב העבודה של הליד');
    property = propertyContextFromListing(listing as unknown as Record<string, unknown>);
  }
  const ownerIdentity = await identity(admin, workspaceId);
  const fullName = lead.full_name?.trim() ?? '';
  if (fullName.length < 2) throw new Error('יש להשלים שם מלא בליד לפני שיחה עם ריטה');
  const phone = ritaPhoneE164(lead.phone_number);
  if (!phone) throw new Error('מספר הטלפון של הליד אינו תקין');
  return { workspaceId, leadId, propertyId, fullName, phone, ...ownerIdentity, property };
}

async function resolveGeneralContext(admin: RitaAdmin, input: ReturnType<typeof ritaOutboundInputSchema.parse>, userId: string | null, service: boolean): Promise<ResolvedContext> {
  if (service && (input.call_role === 'broker_invite' || input.hat === 'broker_invite')) {
    const brokerId = input.workspace_owner_id;
    if (!brokerId) throw new Error('חסר המתווך המוזמן');
    const { data: journey, error } = await admin.from('broker_outreach_journeys').select('enabled,call_consent_at,interested_at,opted_out_at,cancel_requested_at,otp_verified_phone').eq('broker_id', brokerId).single();
    if (error || !journey?.enabled || !journey.call_consent_at || !journey.interested_at || journey.opted_out_at || journey.cancel_requested_at || ritaPhoneE164(journey.otp_verified_phone) !== ritaPhoneE164(input.phone_number)) throw new Error('שיחת הזמנה דורשת הסכמה ומספר מאומת של המתווך');
    const { data: profile, error: profileError } = await admin.from('profiles').select('full_name').eq('id', brokerId).single();
    if (profileError || !profile?.full_name) throw new Error('שם המתווך אינו זמין');
    return { workspaceId: brokerId, leadId: null, propertyId: null, fullName: profile.full_name, phone: ritaPhoneE164(journey.otp_verified_phone), ...(await identity(admin, brokerId)), property: {}, gender: await profileGender(admin, brokerId) };
  }
  if (!service && input.demo) {
    const { data: profile, error } = await admin.from('profiles').select('full_name,phone').eq('id', userId ?? '').maybeSingle();
    if (error || !profile) throw new Error('לא ניתן לטעון את פרטי המשתמש לשיחת ההדגמה');
    const phone = ritaPhoneE164(profile.phone);
    if (!phone) throw new Error('יש לשמור מספר טלפון מאומת בפרופיל לפני שיחת הדגמה');
    return { workspaceId: null, leadId: null, propertyId: null, fullName: profile.full_name?.trim() || 'אורח', phone, agencyName: 'TORAFF', agentName: 'TORAFF', property: {} };
  }
  if (!service) {
    const { data: profile, error } = await admin.from('profiles').select('full_name,phone').eq('id', userId ?? '').maybeSingle();
    if (error || !profile) throw new Error('לא ניתן לטעון את פרטי המשתמש');
    const requested = ritaPhoneE164(input.phone_number || (input.call_role === 'broker_support' || input.hat === 'broker_support' ? profile.phone : ''));
    const ownPhone = ritaPhoneE164(profile.phone);
    if (!requested || requested !== ownPhone) throw new Error('ללא ליד ניתן לחייג רק למספר המאומת שלך');
    return { workspaceId: userId, leadId: null, propertyId: null, fullName: profile.full_name?.trim() || '', phone: requested, ...(await identity(admin, userId)), property: {}, gender: await profileGender(admin, userId) };
  }
  const fullName = input.full_name?.trim() ?? '';
  const phone = ritaPhoneE164(input.phone_number);
  if (!phone || fullName.length < 2) throw new Error('שם מלא ומספר טלפון תקין נדרשים לשיחה');
  return { workspaceId: input.workspace_owner_id || null, leadId: null, propertyId: null, fullName, phone, ...(await identity(admin, input.workspace_owner_id || null)), property: {} };
}

async function elevenLabsOutbound(key: string, payload: Record<string, unknown>) {
  const response = await fetch('https://api.elevenlabs.io/v1/convai/twilio/outbound-call', {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000),
  });
  const raw = await response.text();
  if (!response.ok) {
    console.error('ElevenLabs outbound call failed', response.status, raw.slice(0, 1500));
    throw new Error(`ElevenLabs דחה את בקשת השיחה (${response.status})`);
  }
  return JSON.parse(raw) as { success?: boolean; message?: string; conversation_id?: string; callSid?: string };
}

export async function startRitaOutboundCall({ admin, userClient, userId, rawInput, service = false }: {
  admin: RitaAdmin;
  userClient: Client;
  userId: string | null;
  rawInput: unknown;
  service?: boolean;
}) {
  const input = ritaOutboundInputSchema.parse(rawInput);
  if (!service && !userId) throw new Error('נדרשת התחברות');
  if (input.hat && input.call_role && input.hat !== input.call_role) throw new Error('תפקיד השיחה אינו תואם');
  const requestedRole = input.call_role ?? input.hat;
  if (!service && requestedRole === 'broker_invite') throw new Error('שיחת הזמנה נשלחת רק במסלול הסכמה מאומת');
  let resolved: ResolvedContext;
  let testRole: RitaCallRole | null = null;
  let testInstructions = '';
  if (!service && input.test_scenario) {
    const { data: allowed, error } = await userClient.rpc('has_role', { _user_id: userId ?? '', _role: 'super_admin' });
    if (error || !allowed) throw new Error('שיחות בדיקה למספר חופשי זמינות למנהל המערכת בלבד');
    const phone = ritaPhoneE164(input.phone_number);
    if (!phone) throw new Error('מספר הטלפון לבדיקה אינו תקין');
    testRole = input.test_scenario === 'seller_lead' ? 'property_lead' : input.test_scenario === 'broker_onboarded' ? 'broker_support' : input.test_scenario;
    if (input.test_scenario === 'seller_lead') testInstructions = 'שיחת בדיקה: הפונה מעוניין למכור נכס. יש לברר כתובת, סוג נכס, מחיר מבוקש ולוח זמנים.';
    else if (input.test_scenario === 'property_lead') testInstructions = 'שיחת בדיקה: הפונה מתעניין ברכישת דירה. יש לברר תקציב, אזור, חדרים ולוח זמנים.';
    else if (input.test_scenario === 'broker_onboarded') testInstructions = 'שיחת בדיקה: מתווך שכבר קיבל את ההזמנה והתחבר לפרופיל שנוצר עבורו.';
    resolved = { workspaceId: null, leadId: null, propertyId: null, fullName: input.full_name?.trim() || '', phone, agencyName: 'TORAFF', agentName: 'TORAFF', property: {}, gender: input.gender ?? 'male' };
  } else if (input.lead_id) {
    const { data: authorizedLead, error } = await userClient.from('leads').select('id,workspace_owner_id').eq('id', input.lead_id).maybeSingle();
    if (error || !authorizedLead) throw new Error('הליד אינו זמין במרחב העבודה שלך');
    if (input.workspace_owner_id && authorizedLead.workspace_owner_id !== input.workspace_owner_id) throw new Error('הליד אינו שייך למרחב העבודה שצוין');
    resolved = await resolveLeadCallContext(admin, input.lead_id, input.property_id || null);
  } else {
    resolved = await resolveGeneralContext(admin, input, userId, service);
  }
  if (input.property_id && !resolved.propertyId) throw new Error('לא ניתן לקשר את הנכס לשיחה');

  let callRole: RitaCallRole = resolved.leadId ? 'property_lead' : 'general_inbound';
  if (testRole) callRole = testRole;
  else if (service && requestedRole === 'broker_invite') callRole = 'broker_invite';
  else if (!resolved.leadId && !input.demo && userId) {
    const { data: broker, error } = await userClient.from('user_roles').select('user_id').eq('user_id', userId).in('role', ['agent', 'managing_broker', 'lead_agent']).limit(1).maybeSingle();
    if (error) throw new Error('לא ניתן לאמת את תפקיד החשבון');
    if (broker) callRole = 'broker_support';
  }
  if (!testRole && requestedRole && requestedRole !== callRole) throw new Error('תפקיד השיחה אינו תואם לנמען המאומת');

  const runtime = await getRitaRuntime(admin);
  const variables = buildRitaDynamicVariables({
    agencyName: resolved.agencyName,
    agentName: resolved.agentName,
    brokerId: resolved.workspaceId,
    fullName: resolved.fullName,
    phone: resolved.phone,
    property: resolved.property,
    source: input.source,
    instructions: [testInstructions, input.instructions].filter(Boolean).join('\n') || undefined,
    callRole,
    gender: normalizeRitaGender(resolved.gender),
    isTestCall: !!testRole,
    brokerStage: input.test_scenario === 'broker_onboarded' ? 'onboarded_welcome' : null,
    inviteContext: callRole === 'broker_invite' ? (input.invite_context || (testRole ? 'שיחת בדיקה של הזמנת מתווך חדש ל-TORAFF' : '')) : '',
  });
  const { data: context, error: contextError } = await admin.from('rita_call_contexts').insert({
    workspace_owner_id: resolved.workspaceId,
    lead_id: resolved.leadId,
    property_id: resolved.propertyId,
    direction: 'outbound',
    source: input.source,
    full_name: resolved.fullName,
    lead_phone: resolved.phone,
    agency_name: resolved.agencyName,
    agent_name: resolved.agentName,
    property_context: json(resolved.property),
    dynamic_variables: json(variables),
    status: 'pending',
    source_context: json({ demo: input.demo, test_scenario: input.test_scenario ?? null, requested_by: service ? 'trusted_service' : userId }),
  }).select('*').single();
  if (contextError || !context) throw new Error('שמירת הקשר השיחה נכשלה');
  const dynamicVariables: RitaDynamicVariables = { ...variables, rita_call_context_id: context.id };

  let provider: Awaited<ReturnType<typeof elevenLabsOutbound>> | null = null;
  let failure: unknown = null;
  try {
    const key = process.env['ELEVENLABS_API_KEY'];
    if (!key) throw new Error('ElevenLabs אינו מחובר לפרויקט');
    provider = await elevenLabsOutbound(key, {
      agent_id: runtime.agent_id,
      agent_phone_number_id: runtime.agent_phone_number_id,
      to_number: resolved.phone,
      conversation_initiation_client_data: {
        dynamic_variables: ritaProviderVariables(dynamicVariables),
        ...(resolved.leadId ? { user_id: resolved.leadId } : {}),
        source_info: { source: 'twilio', version: 'toraff-rita-v1' },
        conversation_config_override: {
          ...(testRole ? { conversation: { max_duration_seconds: RITA_TEST_MAX_SECONDS } } : callRole === 'broker_invite' ? { conversation: { max_duration_seconds: 90 } } : {}),
          agent: {
            first_message: ritaOpeningGreeting(dynamicVariables),
          },
          tts: { ...(input.voice_id ? { voice_id: input.voice_id } : {}), pronunciation_dictionary_locators: ritaPronunciationLocators(runtime.pronunciation_dictionaries, dynamicVariables.gender) },
        },
      },
      call_recording_enabled: false,
    });
    if (!provider.success || !provider.conversation_id) throw new Error('ElevenLabs לא החזיר אישור שיחה תקין');
  } catch (error) { failure = error; }

  const status = failure ? 'failed' : 'queued';
  const { error: updateError } = await admin.from('rita_call_contexts').update({
    status,
    conversation_id: provider?.conversation_id ?? null,
    provider_call_id: provider?.callSid ?? null,
    dynamic_variables: json(dynamicVariables),
    transcript_summary: failure ? (failure instanceof Error ? failure.message : 'השיחה נכשלה') : null,
    updated_at: new Date().toISOString(),
  }).eq('id', context.id);
  if (updateError) throw new Error('השיחה נשלחה אך עדכון מצב השיחה נכשל. יש לבדוק לפני ניסיון נוסף.');

  if (input.record_call && resolved.workspaceId) {
    const { error: recordError } = await admin.from('call_records').insert({
      user_id: resolved.workspaceId,
      lead_id: resolved.leadId,
      caller_phone: resolved.phone,
      direction: 'outbound',
      status: failure ? 'failed' : 'in_progress',
      handled_by: 'ai',
      needs_callback: !!failure,
      callback_reason: failure ? (failure instanceof Error ? failure.message.slice(0, 200) : 'השיחה נכשלה') : null,
      started_at: new Date().toISOString(),
      elevenlabs_conversation_id: provider?.conversation_id ?? null,
      metadata: json({ provider: 'elevenlabs', provider_call_id: provider?.callSid ?? null, rita_call_context_id: context.id, lead_name: resolved.fullName, lead_first_name: firstNameFromFullName(resolved.fullName), listing_id: resolved.propertyId, source: input.source, error: failure ? String(failure) : null }),
    });
    if (recordError) throw new Error('השיחה נשלחה אך שמירת ניסיון השיחה נכשלה. יש לבדוק לפני ניסיון נוסף.');
  }
  if (failure) throw failure;
  return {
    success: true,
    conversation_id: provider?.conversation_id,
    call_id: provider?.callSid ?? provider?.conversation_id,
    call: { id: provider?.conversation_id, callSid: provider?.callSid },
    context_id: context.id,
    dynamic_variables: dynamicVariables,
  };
}
