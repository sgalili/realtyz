import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';

export type RegistryProfile = { id: string; full_name: string; city?: string | null; broker_license_number: string };
export function BrokerRegistryNameButton({ userId, license, disabled, onUpdated }: { userId: string; license: string; disabled?: boolean; onUpdated: (profile: RegistryProfile) => void }) {
  const { isSuperAdmin } = useUserRole();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [found, setFound] = useState<{ full_name: string; city?: string } | null>(null);
  const scope = `${userId}:${license}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  useEffect(() => { currentScope.current = scope; setBusy(false); setErrorMessage(''); setFound(null); return () => { currentScope.current = ''; }; }, [scope]);
  if (!isSuperAdmin) return null;
  const fetchName = async () => {
    if (busy || !/^[1-9][0-9]{0,9}$/.test(license)) return;
    const requestScope = scope;
    setBusy(true); setErrorMessage('');
    try {
      const { data, error } = await supabase.functions.invoke('admin-broker-registry-name', { body: { user_id: userId, license_number: license } });
      if (currentScope.current !== requestScope) return;
      if (error || !data?.profile) {
        let message = data?.message;
        const response = (error as { context?: Response } | null)?.context;
        if (!message && response) { try { message = (await response.clone().json()).message; } catch { /* non-JSON failure */ } }
        throw new Error(message || 'לא ניתן לשלוף את פרטי הרישיון כרגע. נסו שוב מאוחר יותר.');
      }
      if (data.profile.id !== userId || data.profile.broker_license_number !== license) throw new Error('הפרטים שהתקבלו אינם תואמים לפרופיל המבוקש');
      setFound(data.registry ?? { full_name: data.profile.full_name });
      onUpdated(data.profile);
      await Promise.all(['admin-profiles', 'workspaces', 'app-header-user-profile', 'workspace-owner-profile', 'account-identity'].map(key => qc.invalidateQueries({ queryKey: [key] })));
      if (currentScope.current === requestScope) { toast.success(`נשלף מהמאגר: ${data.profile.full_name}${data.registry?.city ? ` · ${data.registry.city}` : ''}`); window.dispatchEvent(new Event('realtyz:profile-saved')); }
    } catch (error) {
      if (currentScope.current !== requestScope) return;
      const message = error instanceof Error ? error.message : 'שליפת פרטי הרישיון נכשלה';
      setErrorMessage(message); toast.error(message);
    } finally { if (currentScope.current === requestScope) setBusy(false); }
  };
  return <div className="min-w-0 space-y-1">
    <Button type="button" variant="outline" disabled={busy || disabled || !/^[1-9][0-9]{0,9}$/.test(license)} onClick={() => void fetchName()} className="h-auto min-h-9 max-w-full gap-2 whitespace-normal px-3 py-2 text-sm leading-snug">
      {busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Download className="h-4 w-4 shrink-0" />}משוך נתונים מהמאגר הלאומי
    </Button>
    {found && <p role="status" className="text-sm text-success [overflow-wrap:anywhere]">שם במאגר: <b>{found.full_name}</b>{found.city ? <> · עיר: <b>{found.city}</b></> : null} · הרישיון אומת</p>}
    {errorMessage && <p role="alert" className="text-sm text-destructive [overflow-wrap:anywhere]">{errorMessage}</p>}
  </div>;
}