import { supabase } from '@/lib/supabaseClient';

export async function logAuditEvent(params: {
  action: string;
  targetTable?: string;
  targetId?: string;
  details?: Record<string, unknown>;
}) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('audit_logs' as any).insert({
      action: params.action,
      actor_id: user.id,
      actor_email: user.email ?? null,
      target_table: params.targetTable ?? null,
      target_id: params.targetId ?? null,
      details: params.details ?? {},
    } as any);
  } catch (err) {
    console.error('Audit log error:', err);
  }
}
