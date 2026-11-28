import { z } from 'zod';
import type { Database, Json } from '@/integrations/supabase/types';
import { buildRitaDynamicVariables, isPlaceholderLeadName, normalizeRitaPhone, propertyContextFromListing, ritaPhoneE164, ritaCallRoleSchema, ritaOpeningGreeting } from './ritaVoice';
import { resolveLeadCallContext } from './ritaVoiceOutbound.server';
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
  if (existing) return { type: 'conversation_initiation_client_data', dynamic_variables: existing.dynamic_variables };

  let contextValues: {
    workspaceId: string | null; leadId: string | null; propertyId: string | null;
    fullName: string; agencyName: string; agentName: string;
    property: ReturnType<typeof propertyContextFromListing>;
  } = { workspaceId: null, leadId: null, propertyId: null, fullName: '', agencyName: 'TORAFF', agentName: 'TORAFF', property: {} };

  const { data: prior } = phone ? await admin.from('rita_call_contexts').select('*').eq('lead_phone', phone).order('created_at', { ascending: false }).limit(1).maybeSingle() : { data: null };
  if (prior) {
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
    const { data: lead } = await admin.from('leads').select('id').eq('phone_number', normalized).order('last_interaction_at', { ascending: false }).limit(1).maybeSingle();
    if (lead) {
      const resolved = await resolveLeadCallContext(admin, lead.id);
      contextValues = { workspaceId: resolved.workspaceId, leadId: resolved.leadId, propertyId: resolved.propertyId, fullName: resolved.fullName, agencyName: resolved.agencyName, agentName: resolved.agentName, property: resolved.property };
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
    callRole: ritaCallRoleSchema.safeParse(record(prior?.dynamic_variables)['call_role']).data ?? (contextValues.leadId ? 'property_lead' : 'general_inbound'),
    inviteContext: text(record(prior?.dynamic_variables)['invite_context'], 1500),
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
    dynamic_variables: dynamicVariables,
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
  const qualification = {
    timeline_urgency: collectionValue(collected['timeline_urgency']) ?? null,
    budget_financing: collectionValue(collected['budget_financing']) ?? null,
    area_flexibility: collectionValue(collected['area_flexibility']) ?? null,
    viewing_availability: collectionValue(collected['viewing_availability']) ?? null,
    requested_callback: collectionValue(collected['requested_callback']) ?? null,
  };
  const matchedPropertyIds = propertyIds(dynamic['matched_property_ids'] ?? collectionValue(collected['matched_property_ids']));
  if (context.property_id && !matchedPropertyIds.includes(context.property_id)) matchedPropertyIds.unshift(context.property_id);
  const summary = text(analysis['transcript_summary'] || data['summary'], 20000);
  const transcript = data['transcript'] ?? data['transcript_with_metadata'] ?? [];
  const asText = transcriptText(transcript);
  const metadata = record(data['metadata']);
  const phoneCall = record(metadata['phone_call']);
  const callerPhone = ritaPhoneE164(text(phoneCall['external_number'] || phoneCall['from_number'] || metadata['caller_id'], 40) || context.lead_phone);
  const fullName = text(dynamic['lead_full_name'] || collectionValue(collected['full_name']), 80) || context.full_name || '';
  const duration = Number(metadata['call_duration_secs'] ?? metadata['duration_secs'] ?? 0);
  const needsCallback = qualification.requested_callback === true || (Array.isArray(transcript) && transcript.some(turn => {
    const calls = record(turn)['tool_calls'];
    return Array.isArray(calls) && calls.some(call => text(record(call)['tool_name'] || record(call)['name'], 80) === 'request_callback');
  }));

  let leadId = context.lead_id;
  const workspaceId = context.workspace_owner_id;
  const normalized = normalizeRitaPhone(callerPhone);
  let leadPreferences: Record<string, unknown> = {};
  if (callRole === 'property_lead' && workspaceId && normalized) {
    if (!leadId) {
      const { data: existingLead } = await admin.from('leads').select('id,full_name,preferences,notes').eq('workspace_owner_id', workspaceId).eq('phone_number', normalized).maybeSingle();
      leadId = existingLead?.id ?? null;
      leadPreferences = record(existingLead?.preferences);
      if (!leadId && fullName) {
        const { data: created, error } = await admin.from('leads').insert({
          workspace_owner_id: workspaceId,
          full_name: fullName,
          phone_number: normalized,
          city: text(record(context.property_context)['city'], 120) || null,
          deal_type: text(record(context.property_context)['deal_type'], 20) === 'rent' ? 'rent' : 'sale',
          linked_listing_id: context.property_id,
          lead_stage: 'engaged',
          status: 'new',
          last_interaction_at: new Date().toISOString(),
          preferences: json({ voice_qualification: qualification, matched_property_ids: matchedPropertyIds, last_call_summary: summary }),
        }).select('id').single();
        if (error) throw error;
        leadId = created.id;
      }
    }
    if (leadId) {
      const { data: lead, error: leadError } = await admin.from('leads').select('full_name,preferences,notes').eq('id', leadId).eq('workspace_owner_id', workspaceId).single();
      if (leadError) throw leadError;
      leadPreferences = record(lead.preferences);
      const nextPreferences = {
        ...leadPreferences,
        voice_qualification: qualification,
        matched_property_ids: matchedPropertyIds,
        last_voice_conversation_id: conversationId,
        last_call_summary: summary,
        ...(context.property_id ? { source_property_id: context.property_id } : {}),
      };
      const update: Database['public']['Tables']['leads']['Update'] = {
        preferences: json(nextPreferences),
        last_interaction_at: new Date().toISOString(),
        lead_stage: 'engaged',
        ...(context.property_id ? { linked_listing_id: context.property_id } : {}),
      };
      if (fullName && isPlaceholderLeadName(lead.full_name)) update['full_name'] = fullName;
      const alreadyProcessed = leadPreferences['last_voice_conversation_id'] === conversationId;
      if (summary && !alreadyProcessed) update['notes'] = [lead.notes?.trim(), `סיכום שיחת ריטה:\n${summary}`].filter(Boolean).join('\n\n');
      const { error } = await admin.from('leads').update(update).eq('id', leadId).eq('workspace_owner_id', workspaceId);
      if (error) throw error;
    }
  }

  let callRecordId: string | null = null;
  if (workspaceId) {
    const callRow = {
      user_id: workspaceId,
      lead_id: leadId,
      elevenlabs_conversation_id: conversationId,
      caller_phone: callerPhone || context.lead_phone,
      direction: context.direction,
      handled_by: 'ai',
      status: needsCallback ? 'escalated' : 'completed',
      duration_seconds: Number.isFinite(duration) ? Math.max(0, Math.round(duration)) : 0,
      transcript: json(transcript),
      transcript_text: asText,
      summary,
      needs_callback: needsCallback,
      callback_reason: needsCallback ? 'הלקוח ביקש חזרה אנושית' : null,
      ended_at: new Date().toISOString(),
      metadata: json({ provider: 'elevenlabs', call_role: callRole, rita_call_context_id: context.id, listing_id: context.property_id, qualification, matched_property_ids: matchedPropertyIds, source: context.source }),
    };
    const { data: existingCall } = await admin.from('call_records').select('id').eq('elevenlabs_conversation_id', conversationId).maybeSingle();
    if (existingCall) {
      const { error } = await admin.from('call_records').update(callRow).eq('id', existingCall.id);
      if (error) throw error;
      callRecordId = existingCall.id;
    } else {
      const { data: inserted, error } = await admin.from('call_records').insert(callRow).select('id').single();
      if (error) throw error;
      callRecordId = inserted.id;
    }
  }

  if (leadId) {
    const { data: existingMessage } = await admin.from('messages').select('id').filter('metadata->>conversation_id', 'eq', conversationId).limit(1).maybeSingle();
    if (!existingMessage) {
      const { error } = await admin.from('messages').insert({
        lead_id: leadId,
        direction: 'inbound',
        sender_type: 'ai',
        platform: 'whatsapp',
        channel: 'voice',
        content: `📞 שיחת ריטה\n${summary || asText.slice(0, 4000)}`,
        metadata: json({ source: 'ai_voice_call', conversation_id: conversationId, qualification, matched_property_ids: matchedPropertyIds, rita_call_context_id: context.id }),
      });
      if (error) throw error;
    }
  }

  const { error: contextError } = await admin.from('rita_call_contexts').update({
    lead_id: leadId,
    full_name: fullName || context.full_name,
    lead_phone: callerPhone || context.lead_phone,
    status: needsCallback ? 'escalated' : 'completed',
    qualification: json(qualification),
    matched_property_ids: matchedPropertyIds,
    transcript_summary: summary || asText.slice(0, 20000),
    dynamic_variables: json(dynamic),
    updated_at: new Date().toISOString(),
  }).eq('id', context.id);
  if (contextError) throw contextError;
  if (callRole === 'broker_invite' && workspaceId) {
    const { error } = await admin.from('broker_outreach_journeys').update({ call_status: 'completed', last_error: null }).eq('broker_id', workspaceId).eq('call_provider_id', conversationId);
    if (error) throw error;
    await admin.from('broker_outreach_events').upsert({ broker_id: workspaceId, workspace_owner_id: workspaceId, event_key: `rita-call:${conversationId}`, kind: 'call_status', detail: json({ provider: 'elevenlabs', status: 'completed', summary, transcript: asText.slice(0, 12000), call_role: callRole }) }, { onConflict: 'event_key' });
  }
  return { received: true, conversation_id: conversationId, lead_id: leadId, call_record_id: callRecordId, qualification, matched_property_ids: matchedPropertyIds };
}
