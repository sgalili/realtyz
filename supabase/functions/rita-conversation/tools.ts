import { jsonSchema, tool, type ToolSet } from 'npm:ai@7';
import { claimAndExecute, validAction, type ActionKind, type ConversationScope } from './actions.ts';

export function conversationTools(admin: any, client: any, scope: ConversationScope, automatic: boolean): ToolSet {
  const make = (kind: ActionKind, description: string, properties: Record<string, any>) => tool({
    description,
    inputSchema: jsonSchema<Record<string, unknown>>({ type: 'object', properties: { ...properties, execute_now: { type: 'boolean', description: 'true רק כשהמבקש הורה לבצע כעת; false להצעת כפתור המשך' } }, required: [...Object.keys(properties), 'execute_now'], additionalProperties: false }),
    execute: async input => {
      const { execute_now, ...payload } = input;
      if (automatic && execute_now) return { success: false, message: 'המענה האוטומטי נשלח בשיחה; אין לשלוח אותו פעמיים' };
      if (!validAction(kind, payload, scope)) return { success: false, message: 'פרטי פעולה חסרים או לא תקינים' };
      const operation_key = JSON.stringify([kind, payload]);
      const { data: row, error } = await admin.from('rita_conversation_actions').upsert({ interaction_id: scope.interaction, requested_by: scope.actor, workspace_owner_id: scope.workspace, kind, payload, label: { send_message: 'שליחת הודעה', send_property: 'שליחת פרטי הנכס', schedule_followup: 'קביעת מעקב', advance_lead: 'קידום שלב הליד' }[kind], operation_key }, { onConflict: 'interaction_id,operation_key', ignoreDuplicates: true }).select('id').maybeSingle();
      if (error || !row) return { success: false, message: 'הפעולה כבר נרשמה או לא ניתן לשמור אותה' };
      if (!execute_now) return { success: true, proposed: true, message: 'כפתור המשך נוסף לשיחה, הפעולה טרם בוצעה' };
      try { return await claimAndExecute(admin, client, scope, row.id); }
      catch (error) { return { success: false, message: error instanceof Error ? error.message : 'הפעולה נכשלה' }; }
    },
  });
  const send = make('send_message', 'שליחת הודעה ישירה בשיחה הנוכחית בלבד. בליד השליחה היא WhatsApp הרשמי בתוך חלון מענה. בקהילה בשם ריטה וללא נתוני CRM. אין לספק טיוטת העתקה במקום הפעלת הכלי כשנתבקשה שליחה.', { content: { type: 'string' } });
  if (scope.kind !== 'lead') return { send_message: send };
  return {
    send_message: send,
    send_property: make('send_property', 'שיתוף נכס מזוהה, מורשה וזמין בלבד. מזהה הנכס חייב להופיע בשיחה; אין לנחש.', { listing_id: { type: 'string' } }),
    schedule_followup: make('schedule_followup', 'קביעת מעקב לליד בזמן ISO עתידי מוחלט. שאלי על מועד אם לא ידוע.', { title: { type: 'string' }, due_at: { type: 'string' } }),
    advance_lead: make('advance_lead', 'עדכון שלב לליד לפי הסכמה וראיות מהשיחה בלבד; לעולם לא לסגור עסקה או לשנות תשלום.', { stage: { type: 'string', enum: ['listing_outreach', 'negotiation'] } }),
  };
}