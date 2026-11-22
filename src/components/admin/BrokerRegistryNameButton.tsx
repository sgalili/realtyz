import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ShieldX, ShieldCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useAuth } from '@/hooks/useAuth';
import { verifyBrokerLicense } from '@/lib/brokerLicense';

export type RegistryProfile = { id: string; full_name: string; city?: string | null; broker_license_number: string };
export function BrokerRegistryNameButton({ userId, license, disabled, compact = false, presentation = 'shield', ownAccount = false, onUpdated }: { userId: string; license: string; disabled?: boolean; compact?: boolean; presentation?: 'shield' | 'approved'; ownAccount?: boolean; onUpdated: (profile: RegistryProfile, active?: boolean) => void }) {
  const { isSuperAdmin } = useUserRole();
  const { user } = useAuth();
  const self = ownAccount && user?.id === userId;
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);
  const [found, setFound] = useState<{ full_name: string; city?: string } | null>(null);
  const scope = `${userId}:${license}:${self}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  useEffect(() => { currentScope.current = scope; inFlight.current=false;setBusy(false); setErrorMessage(''); setFailed(false);setFound(null); return () => { currentScope.current = ''; }; }, [scope]);
  useEffect(() => { if(!errorMessage)return;const timer=window.setTimeout(()=>setErrorMessage(''),5000);return()=>window.clearTimeout(timer); }, [errorMessage]);
  if (!isSuperAdmin && !self) return null;
  const fetchName = async () => {
    if (inFlight.current || !/^[1-9][0-9]{0,9}$/.test(license)) return;
    const requestScope = scope;
    inFlight.current=true;setBusy(true); setErrorMessage('');
    try {
      const response = self ? await verifyBrokerLicense(license,'verify',true).then(result=>({data:{profile:result.profile,registry:{full_name:result.holderName??result.profile?.full_name,city:result.city},active:result.active,message:undefined},error:null})) : await supabase.functions.invoke('admin-broker-registry-name', { body: { user_id: userId, license_number: license } });
      const { data, error } = response;
      if (currentScope.current !== requestScope) return;
      if (error || !data?.profile) {
        let message = data?.message;
        const response = (error as { context?: Response } | null)?.context;
        if (!message && response) { try { message = (await response.clone().json()).message; } catch { /* non-JSON failure */ } }
        throw new Error(message || 'לא ניתן לשלוף את פרטי הרישיון כרגע. נסו שוב מאוחר יותר.');
      }
      if (data.profile.id !== userId || data.profile.broker_license_number !== license) throw new Error('הפרטים שהתקבלו אינם תואמים לפרופיל המבוקש');
      setFound(data.registry ?? { full_name: data.profile.full_name });
      setFailed(false);
      if(typeof data.active==='boolean')onUpdated(data.profile,data.active);else onUpdated(data.profile);
      await Promise.all(['admin-profiles', 'workspaces', 'app-header-user-profile', 'workspace-owner-profile', 'account-identity'].map(key => qc.invalidateQueries({ queryKey: [key] })));
      if (currentScope.current === requestScope) { toast.success(`נשלף מהמאגר: ${data.profile.full_name}${data.registry?.city ? ` · ${data.registry.city}` : ''}`); window.dispatchEvent(new Event('realtyz:profile-saved')); }
    } catch (error) {
      if (currentScope.current !== requestScope) return;
      const message = error instanceof Error ? error.message : 'שליפת פרטי הרישיון נכשלה';
      setFailed(true);setErrorMessage(message); toast.error(message,{duration:5000});
    } finally { if (currentScope.current === requestScope) {inFlight.current=false;setBusy(false);} }
  };
  return <div className={compact ? 'flex min-w-0 shrink-0 items-center gap-2' : 'min-w-0 space-y-1'}>
    <Button type="button" variant="ghost" size={presentation==='approved'?'default':'icon'} title="איתור מספר רישיון במאגר הלאומי" aria-label={presentation==='approved'?'בדיקה חוזרת של הרישיון המאושר במאגר הלאומי':'איתור מספר רישיון במאגר הלאומי'} aria-busy={busy} disabled={busy || disabled || !!found || !/^[1-9][0-9]{0,9}$/.test(license)} onClick={() => void fetchName()} className={`h-9 shrink-0 border-none p-0 shadow-none hover:bg-transparent hover:opacity-80 ${presentation==='approved'?'px-1 text-sm font-semibold text-success':`w-9 ${found?'text-success':failed?'broker-registry-failed':'text-destructive'}`}`}>
      {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : presentation==='approved' ? (found?'מאומת':'מאושר') : found ? <ShieldCheck className="h-5 w-5 text-success" /> : <ShieldX className={`h-5 w-5 ${failed?'broker-registry-failed':'text-destructive'}`} />}
    </Button>
    {found && !compact && <p role="status" className="text-sm text-success [overflow-wrap:anywhere]">שם במאגר: <b>{found.full_name}</b>{found.city ? <> · עיר: <b>{found.city}</b></> : null} · הרישיון אומת</p>}
    {errorMessage && !compact && <p role="alert" className="text-sm text-destructive [overflow-wrap:anywhere]">{errorMessage}</p>}
  </div>;
}