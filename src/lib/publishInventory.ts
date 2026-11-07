export type InventoryPublicationClient = {
  from: (table: 'listings') => any;
};

export function publicationErrorMessage(error: unknown): string {
  const message = typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : '';
  if (/broker_sms_verification_required/.test(message)) return 'יש להשלים אימות טלפון למתווך לפני פרסום הנכס.';
  if (/verified_broker_required/.test(message)) return 'יש להשלים את אישור רישיון התיווך לפני הפרסום.';
  if (/permission denied|row-level security|workspace/i.test(message)) return 'אין הרשאה לפרסם את הנכס במשרד הפעיל. יש לבחור את המשרד המתאים ולנסות שוב.';
  if (/fetch|network/i.test(message)) return 'לא ניתן לשמור את הפרסום כרגע. בדקו את החיבור ונסו שוב.';
  if (/[\u0590-\u05ff]/.test(message)) return message;
  return 'הנכס לא פורסם. לא ניתן לשמור את השינויים כרגע; נסו שוב.';
}

/** Direct public-board promotion: no social connection, campaign or wallet calls. */
export async function publishInventory(client: InventoryPublicationClient, workspaceId: string, ids: string[]): Promise<string[]> {
  const uniqueIds = [...new Set(ids)];
  if (!workspaceId || !uniqueIds.length) throw new Error('יש לבחור נכס ומשרד פעיל לפני הפרסום.');
  const { data, error } = await client.from('listings')
    .update({ is_published: true, status: 'live', affiliate_enabled: true })
    .eq('workspace_owner_id', workspaceId).in('id', uniqueIds).neq('status', 'discarded')
    .select('id,workspace_owner_id,is_published,status,affiliate_enabled');
  if (error) throw error;
  const saved = (data ?? []).filter((row: { id: string; workspace_owner_id: string; is_published: boolean; status: string; affiliate_enabled: boolean }) =>
    uniqueIds.includes(row.id) && row.workspace_owner_id === workspaceId && row.is_published && row.status === 'live' && row.affiliate_enabled
  ).map((row: { id: string }) => row.id);
  if (!saved.length) throw new Error('לא נשמרו שינויים. יש לבדוק הרשאות לפרסום במשרד הפעיל.');
  return saved;
}