import { z } from 'zod';
import type { Json } from '@/integrations/supabase/types';
import { buildRitaDynamicVariables, isPlaceholderLeadName, normalizeRitaPhone, propertyContextFromListing, ritaPhoneE164, ritaCallRoleSchema, ritaOpeningGreeting, ritaProviderVariables, type RitaCallRole } from './ritaVoice';
import { resolveLeadCallContext } from './ritaVoiceOutbound.server';
import { conciseRitaText, ritaSummaryBullets, ritaCallSummarySchema } from './ritaCallSummary';
import { getRitaRuntime, verifyElevenLabsPostCallSignature, type RitaAdmin } from './ritaVoiceSecurity.server';

const initiationSchema = z.object({
  caller_id: z.string().max(40),
  agent_id: z.string().max(120),
  called_number: z.string().max(40).optional(),
  call_sid: z.string().max(120).optional(),
  conversation_id: z.string().min(1).max(160),
}).passthrough();

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function text(value: unknown, max = 5000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
function json(value: unknown): Json { return JSON.parse(JSON.stringify(value)) as Json; }
function collectionValue(value: unknown): unknown {
  const item = record(value);
  return 'value' in item ? item['value'] : value;
}
function transcriptText(transcript: unknown): string {
  return Array.isArray(transcript) ? transcript.map(turn => {
    const item = record(turn);
    return `[${text(item['role'] || item['speaker'] || 'agent', 30)}] ${text(item['message'] || item['text'], 4000)}`;
  }).filter(Boolean).join('\n').slice(0, 100000) : '';
}
function propertyIds(value: unknown): string[] {
  let candidate = value;
  if (typeof candidate === 'string') {
    const raw = candidate;
    try { candidate = JSON.parse(raw); } catch { candidate = raw.split(','); }
  }
  if (!Array.isArray(candidate)) return [];
  return Array.from(new Set(candidate.map(String).filter(id => /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)))).slice(0, 20);
}

export async function handleRitaConversationInitiation(admin: RitaAdmin, rawInput: unknown) {
  const input = initiationSchema.parse(rawInput);
  const runtime = await getRitaRuntime(admin);
  if (input.agent_id !== runtime.agent_id) throw new Error('Agent mismatch');
  const phone = ritaPhoneE164(input.caller_id);
  const { data: existing } = await admin.from('rita_call_contexts').select('*').eq('conversation_id', input.conversation_id).maybeSingle();
  if (existing) return { type: 'conversation_initiation_client_data', dynamic_variables: ritaProviderVariables(record(existing.dynamic_variables)) };

  let contextValues: {
    workspaceId: string | null; leadId: string | null; propertyId: string | null;
    fullName: string; agencyName: string; agentName: string;
    property: ReturnType<typeof propertyContextFromListing>;
  } = { workspaceId: null, leadId: null, propertyId: null, fullName: '', agencyName: 'TORAFF', agentName: 'TORAFF', property: {} };
  let contextRole: RitaCallRole = 'general_inbound';

  const { data: prior } = phone ? await admin.from('rita_call_contexts').select('*').eq('lead_phone', phone).order('created_at', { ascending: false }).limit(1).maybeSingle() : { data: null };
  if (prior) {
    contextRole = ritaCallRoleSchema.safeParse(record(prior.dynamic_variables)['call_role']).data ?? (prior.lead_id ? 'property_lead' : 'general_inbound');
    contextValues = {
      workspaceId: prior.workspace_owner_id,
      leadId: prior.lead_id,
      propertyId: prior.property_id,
      fullName: prior.full_name ?? '',
      agencyName: prior.agency_name,
      agentName: prior.agent_name,
      property: (prior.property_context ?? {}) as ReturnType<typeof propertyContextFromListing>,
    };
  } else if (phone) {
    const normalized = normalizeRitaPhone(phone) ?? '';
    const phoneVariants = [normalized, phone, `0${normalized.slice(3)}`];
    const { data: profiles } = await admin.from('profiles').select('id,full_name,broker_byline').in('phone', phoneVariants).limit(2);
    const candidate = profiles?.length === 1 ? profiles[0] : null;
    const { data: broker } = candidate ? await admin.from('user_roles').select('user_id').eq('user_id', candidate.id).in('role', ['agent', 'managing_broker', 'lead_agent']).limit(1).maybeSingle() : { data: null };
    if (candidate && broker) {
      const { data: brand } = await admin.from('white_label_settings').select('agency_name').eq('user_id', candidate.id).maybeSingle();
      const name = candidate.broker_byline?.trim() || candidate.full_name?.trim() || 'TORAFF';
      contextValues = { workspaceId: candidate.id, leadId: null, propertyId: null, fullName: candidate.full_name || '', agencyName: brand?.agency_name?.trim() || name, agentName: name, property: {} };
      contextRole = 'broker_support';
    } else {
    const { data: lead } = await admin.from('leads').select('id').eq('phone_number', normalized).order('last_interaction_at', { ascending: false }).limit(1).maybeSingle();
    if (lead) {
      const resolved = await resolveLeadCallContext(admin, lead.id);
      contextValues = { workspaceId: resolved.workspaceId, leadId: resolved.leadId, propertyId: resolved.propertyId, fullName: resolved.fullName, agencyName: resolved.agencyName, agentName: resolved.agentName, property: resolved.property };
      contextRole = 'property_lead';
    }
    }
  }

  const variables = buildRitaDynamicVariables({
    agencyName: contextValues.agencyName,
    agentName: contextValues.agentName,
    brokerId: contextValues.workspaceId,
    fullName: contextValues.fullName,
    phone,
    property: contextValues.property,
    source: 'inbound_twilio',
    callRole: contextRole,
    inviteContext: text(record(prior?.dynamic_variables)['invite_context'], 1500),
    gender: record(prior?.dynamic_variables)['gender'],
    isTestCall: false,
  });
  const { data: saved, error } = await admin.from('rita_call_contexts').insert({
    workspace_owner_id: contextValues.workspaceId,
    lead_id: contextValues.leadId,
    property_id: contextValues.propertyId,
    direction: 'inbound',
    source: 'inbound_twilio',
    full_name: contextValues.fullName || null,
    lead_phone: phone || null,
    agency_name: contextValues.agencyName,
    agent_name: contextValues.agentName,
    property_context: json(contextValues.property),
    dynamic_variables: json(variables),
    conversation_id: input.conversation_id,
    provider_call_id: input.call_sid ?? null,
    status: 'active',
    source_context: json({ called_number: input.called_number ?? null }),
  }).select('id').single();
  if (error) throw error;
  const dynamicVariables = { ...variables, rita_call_context_id: saved.id };
  await admin.from('rita_call_contexts').update({ dynamic_variables: json(dynamicVariables) }).eq('id', saved.id);
  return {
    type: 'conversation_initiation_client_data',
    dynamic_variables: ritaProviderVariables(dynamicVariables),
    ...(contextValues.leadId ? { user_id: contextValues.leadId } : {}),
    conversation_config_override: {
      agent: {
        first_message: ritaOpeningGreeting(dynamicVariables),
      },
    },
  };
}

export async function handleRitaPostCall(admin: RitaAdmin, rawBody: string, signature: string | null) {
  const runtime = await getRitaRuntime(admin);
  if (!runtime.webhook_secret || !verifyElevenLabsPostCallSignature(rawBody, signature, runtime.webhook_secret)) throw new Error('Unauthorized');
  const payload = JSON.parse(rawBody) as Record<string, unknown>;
  const eventType = text(payload['type'], 80);
  const data = record(payload['data'] ?? payload);
  const agentId = text(data['agent_id'], 120);
  if (agentId !== runtime.agent_id) throw new Error('Agent mismatch');
  const conversationId = text(data['conversation_id'] || data['id'], 160);
  if (!conversationId) throw new Error('Missing conversation');
  if (eventType !== 'post_call_transcription' && eventType !== 'call_initiation_failure') return { received: true, ignored: eventType || 'unknown' };

  const initiation = record(data['conversation_initiation_client_data']);
  let dynamic = record(initiation['dynamic_variables'] ?? record(data['metadata'])['dynamic_variables']);
  const contextId = text(dynamic['rita_call_context_id'], 80);
  let { data: context } = await admin.from('rita_call_contexts').select('*').eq('conversation_id', conversationId).maybeSingle();
  if (!context && contextId) {
    const result = await admin.from('rita_call_contexts').select('*').eq('id', contextId).maybeSingle();
    context = result.data;
  }
  if (!context) throw new Error('Missing call context');
  const storedDynamic = record(context.dynamic_variables);
  const callRole = ritaCallRoleSchema.safeParse(storedDynamic['call_role']).data ?? (context.lead_id ? 'property_lead' : 'general_inbound');
  dynamic = { ...storedDynamic, ...dynamic, call_role: callRole, hat: callRole };

  if (eventType === 'call_initiation_failure') {
    const reason = text(data['failure_reason'], 500) || 'השיחה לא התחברה';
    await admin.from('rita_call_contexts').update({ status: 'failed', transcript_summary: reason, updated_at: new Date().toISOString() }).eq('id', context.id);
    await admin.from('call_records').update({ status: 'failed', needs_callback: true, callback_reason: reason, ended_at: new Date().toISOString() }).eq('elevenlabs_conversation_id', conversationId);
    if (callRole === 'broker_invite' && context.workspace_owner_id) await admin.from('broker_outreach_journeys').update({ call_status: 'blocked', last_error: reason }).eq('broker_id', context.workspace_owner_id).eq('call_provider_id', conversationId);
    return { received: true, status: 'failed', conversation_id: conversationId };
  }
  if (eventType !== 'post_call_transcription') return { received: true, ignored: eventType || 'unknown' };

  const analysis = record(data['analysis']);
  const collected = record(analysis['data_collection_results']);
  const transcript = data['transcript'] ?? data['transcript_with_metadata'] ?? [];
  const asText = transcriptText(transcript);
  const metadata = record(data['metadata']);
  const phoneCall = record(metadata['phone_call']);
  // Provider-returned identity variables never replace the server-owned workspace,
  // role, lead identity or verified call destination.
  const callerPhone = ritaPhoneE164(context.lead_phone) || ritaPhoneE164(text(phoneCall['external_number'] || phoneCall['from_number'] || metadata['caller_id'], 40));
  const collectedFullName = text(collectionValue(collected['full_name']), 80);
  const fullName = context.full_name && !isPlaceholderLeadName(context.full_name) ? context.full_name : collectedFullName || context.full_name || '';
  const needsCallback = collectionValue(collected['requested_callback']) === true || (Array.isArray(transcript) && transcript.some(turn => {
    const calls = record(turn)['tool_calls'];
    return Array.isArray(calls) && calls.some(call => text(record(call)['tool_name'] || record(call)['name'], 80) === 'request_callback');
  }));
  const qualification = {
    timeline_urgency: conciseRitaText(collectionValue(collected['timeline_urgency'])),
    budget_financing: conciseRitaText(collectionValue(collected['budget_financing'])),
    area_flexibility: conciseRitaText(collectionValue(collected['area_flexibility'])),
    viewing_availability: conciseRitaText(collectionValue(collected['viewing_availability'])),
    next_step: conciseRitaText(collectionValue(collected['next_step'])) || (needsCallback ? 'חזרה אנושית מהצוות' : null),
    requested_callback: needsCallback,
  };
  const matchedPropertyIds = propertyIds(collectionValue(collected['matched_property_ids']) ?? dynamic['matched_property_ids']);
  if (context.property_id && !matchedPropertyIds.includes(context.property_id)) matchedPropertyIds.unshift(context.property_id);
  matchedPropertyIds.splice(20);
  const rawSummary = text(analysis['transcript_summary'] || data['summary'], 20000);
  const bullets = ritaSummaryBullets(collectionValue(collected['summary_bullets']), rawSummary);
  const durationValue = Number(metadata['call_duration_secs'] ?? metadata['duration_secs'] ?? 0);
  const duration = Number.isFinite(durationValue) ? Math.min(86400, Math.max(0, Math.round(durationValue))) : 0;
  const startSeconds = Number(metadata['start_time_unix_secs']);
  const startedAt = Number.isFinite(startSeconds) && startSeconds > 946684800 && startSeconds < Date.now() / 1000 + 3600
    ? new Date(startSeconds * 1000).toISOString() : context.created_at || new Date().toISOString();
  const compact = ritaCallSummarySchema.parse({
    conversation_id: conversationId, started_at: startedAt, direction: context.direction,
    duration_seconds: duration, call_role: callRole, bullets, qualification, matched_property_ids: matchedPropertyIds,
  });
  // One service-only transaction owns matching, locks, upserts, latest-card
  // attachment and private cache notifications. Retries cannot race a new card.
  const { data: result, error } = await admin.rpc('sync_rita_post_call', {
    _context_id: context.id,
    _conversation_id: conversationId,
    _result: json({
      full_name: fullName, caller_phone: callerPhone, started_at: startedAt, duration_seconds: duration,
      needs_callback: needsCallback, summary: bullets.join('\n'), transcript, transcript_text: asText,
      qualification, matched_property_ids: matchedPropertyIds, compact,
    }),
  });
  if (error) throw error;
  return result;
}
