export type ActionKind = 'send_message' | 'send_property' | 'schedule_followup' | 'advance_lead';
export type ConversationScope = { kind: 'lead' | 'peer' | 'group'; target: string; actor: string; workspace: string; interaction: string };
export function validAction(kind: ActionKind, payload: Record<string, unknown>, scope: ConversationScope): boolean {
  if (kind !== 'send_message' && scope.kind !== 'lead') return false;
  if (kind === 'send_message') return typeof payload.content === 'string' && payload.content.trim().length > 0 && payload.content.length <= 4000;
  if (kind === 'send_property') return typeof payload.listing_id === 'string' && /^[0-9a-f-]{36}$/i.test(payload.listing_id);
  if (kind === 'schedule_followup') return typeof payload.due_at === 'string' && Date.parse(payload.due_at) > Date.now() && typeof payload.title === 'string' && !!payload.title.trim();
  return payload.stage === 'listing_outreach' || payload.stage === 'negotiation';
}
export function hasReplyWindow(rows: Array<{ created_at: string }>, now = Date.now()): boolean {
  return rows.some(row => { const age = now - Date.parse(row.created_at); return age >= 0 && age < 24 * 60 * 60 * 1000; });
}

export async function executeConversationAction(admin: any, client: any, scope: ConversationScope, kind: ActionKind, payload: Record<string, unknown>) {
  if (!validAction(kind, payload, scope)) throw new Error('פרטי הפעולה אינם תקינים');
  if (scope.kind === 'lead') {
    const { data: lead, error } = await client.from('leads').select('id,workspace_owner_id,phone_number,preferences').eq('id', scope.target).eq('workspace_owner_id', scope.workspace).maybeSingle();
    if (error || !lead) throw new Error('אין הרשאה לליד');
    const { data: paused, error: pauseError } = await admin.rpc('is_ai_paused', { _user_id: scope.workspace });
    if (pauseError || paused) throw new Error('ריטה מושהית בסביבת העבודה');
    if (kind === 'schedule_followup') {
      const { data: reminder, error: reminderError } = await client.from('scheduled_items').insert({ user_id: scope.actor, workspace_owner_id: scope.workspace, title: String(payload.title).slice(0, 300), content: String(payload.title), item_type: 'task', channel: 'internal', status: 'pending', scheduled_for: payload.due_at, metadata: { lead_id: scope.target, action_type: 'follow_up', rita_interaction_id: scope.interaction } }).select('id').single();
      if (reminderError || !reminder) throw new Error('שמירת המעקב נכשלה');
      return { success: true, id: reminder.id, message: 'המעקב נקבע' };
    }
    if (kind === 'advance_lead') {
      const { data: updated, error: updateError } = await client.from('leads').update({ lead_stage: payload.stage }).eq('id', scope.target).eq('workspace_owner_id', scope.workspace).select('id').maybeSingle();
      if (updateError || !updated) throw new Error('עדכון שלב הליד נכשל');
      return { success: true, message: 'שלב הליד עודכן' };
    }
    if (lead.preferences?.whatsapp_opt_out === true || lead.preferences?.do_not_contact === true) throw new Error('הנמען ביקש שלא לקבל הודעות');
    const { data: inbound, error: inboundError } = await client.from('messages').select('created_at').eq('lead_id', scope.target).eq('direction', 'inbound').eq('channel', 'whatsapp').order('created_at', { ascending: false }).limit(1);
    if (inboundError || !hasReplyWindow(inbound ?? [])) throw new Error('שליחה מחוץ לחלון המענה מחייבת תבנית מאושרת והסכמת הנמען');
    let content = String(payload.content ?? '');
    if (kind === 'send_property') {
      const { data: listing, error: listingError } = await client.from('listings').select('id,property_title,address,city,asking_price,slug,status,is_published,affiliate_enabled,distribution_paused').eq('id', payload.listing_id).eq('workspace_owner_id', scope.workspace).maybeSingle();
      if (listingError || !listing || listing.status !== 'live' || (!listing.is_published && !listing.affiliate_enabled) || listing.distribution_paused) throw new Error('הנכס אינו זמין לשיתוף');
      content = [listing.property_title, [listing.address, listing.city].filter(Boolean).join(', '), listing.asking_price ? `${Number(listing.asking_price).toLocaleString('he-IL')} ₪` : '', `https://realtyz.co.il/p/${listing.slug || listing.id}`].filter(Boolean).join('\n');
    }
    const { data, error: sendError } = await admin.functions.invoke('send-whatsapp', { body: { lead_id: scope.target, tenant_id: scope.workspace, message: content, force_official: true, ai_assisted: true } });
    if (sendError || data?.success !== true || !data.message_id) throw new Error('שליחת WhatsApp לא אושרה; יש לבדוק את החיבור והרשאות Meta לפני ניסיון נוסף');
    const { error: saveError } = await admin.rpc('record_interaction_message', { _lead_id: scope.target, _content: content, _direction: 'outbound', _sender_type: 'ai', _platform: 'whatsapp', _external_id: data.message_id, _created_at: new Date().toISOString(), _metadata: { message_id: data.message_id, status: 'sent', rita_interaction_id: scope.interaction } });
    if (saveError) return { success: true, message: 'ההודעה נשלחה; שמירת ההיסטוריה דורשת בדיקה', message_id: data.message_id };
    return { success: true, message: 'ההודעה נשלחה ב־WhatsApp', message_id: data.message_id };
  }
  const checks = scope.kind === 'peer'
    ? await Promise.all([client.rpc('is_community_chat_member', { _user: scope.actor }), client.rpc('is_community_chat_member', { _user: scope.target })])
    : [await client.rpc('can_send_community_group', { _group: scope.target, _user: scope.actor })];
  if (checks.some(check => check.error || !check.data)) throw new Error('אין הרשאה לשיחה');
  if (scope.kind === 'peer') {
    const blocks = await Promise.all([admin.rpc('community_is_blocked', { _recipient: scope.actor, _sender: scope.target }), admin.rpc('community_is_blocked', { _recipient: scope.target, _sender: scope.actor })]);
    if (blocks.some(check => check.error || check.data)) throw new Error('השיחה חסומה');
  }
  // Shared assistant messages retain Rita's identity, never impersonate a participant.
  const { data, error } = await admin.from('rita_chat_interactions').insert({ requested_by: scope.actor, workspace_owner_id: scope.workspace, peer_id: scope.kind === 'peer' ? scope.target : null, group_id: scope.kind === 'group' ? scope.target : null, action: 'reply', prompt: '', response: payload.content, status: 'completed', model: 'system-action', delivered: true }).select('id').single();
  if (error) throw new Error('שליחת ההודעה הפנימית נכשלה');
  return { success: true, message: 'ההודעה נשלחה בשיחה בשם ריטה', id: data.id };
}

export async function claimAndExecute(admin: any, client: any, scope: ConversationScope, id: string) {
  const { data: row, error } = await admin.from('rita_conversation_actions').update({ status: 'running' }).eq('id', id).eq('interaction_id', scope.interaction).eq('requested_by', scope.actor).eq('workspace_owner_id', scope.workspace).eq('status', 'pending').select('*').maybeSingle();
  if (error || !row) throw new Error('הפעולה כבר הופעלה או אינה זמינה');
  try {
    const result = await executeConversationAction(admin, client, scope, row.kind, row.payload);
    await admin.from('rita_conversation_actions').update({ status: 'completed', result }).eq('id', id);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'הפעולה נכשלה';
    await admin.from('rita_conversation_actions').update({ status: 'failed', result: { success: false, message } }).eq('id', id);
    throw error;
  }
}