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
export function BrokerRegistryNameButton({ userId, license, disabled, compact = false, presentation = 'shield', ownAccount = false, noMatch = false, onUpdated }: { userId: string; license: string; disabled?: boolean; compact?: boolean; presentation?: 'shield' | 'approved'; ownAccount?: boolean; noMatch?: boolean; onUpdated: (profile: RegistryProfile, active?: boolean) => void }) {
  const { isSuperAdmin } = useUserRole();
  const { user } = useAuth();
  const self = ownAccount && user?.id === userId;
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [missing, setMissing] = useState(noMatch);
  const inFlight = useRef(false);
  const [found, setFound] = useState<{ full_name: string; city?: string } | null>(null);
  const scope = `${userId}:${license}:${self}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  useEffect(() => { currentScope.current = scope; inFlight.current=false;setBusy(false); setErrorMessage(''); setMissing(noMatch);setFound(null); return () => { currentScope.current = ''; }; }, [scope, noMatch]);
  useEffect(() => { if(!errorMessage)return;const timer=window.setTimeout(()=>setErrorMessage(''),5000);return()=>window.clearTimeout(timer); }, [errorMessage]);
  if (!isSuperAdmin && !self) return null;
  const fetchName = async () => {
    if (missing || inFlight.current || !/^[1-9][0-9]{0,9}$/.test(license)) return;
    const requestScope = scope;
    inFlight.current=true;setBusy(true); setErrorMessage('');
    try {
      const response = self ? await verifyBrokerLicense(license,'verify',true).then(result=>({data:{profile:result.profile,registry:{full_name:result.holderName??result.profile?.full_name,city:result.city},active:result.active,message:undefined},error:null})) : await supabase.functions.invoke('admin-broker-registry-name', { body: { user_id: userId, license_number: license } });
      const { data, error } = response;
      if (currentScope.current !== requestScope) return;
      if (!error && data?.found === false && data?.code === 'license_not_found') {
        const message = data.message || 'מספר הרישיון לא נמצא במאגר הלאומי';
        setFound(null); setMissing(true);  setErrorMessage(message);
        void qc.invalidateQueries({ queryKey: ['broker-contact-queue'] });
        toast.error(message, { duration: 5000 });
        return;
      }
      if (error || !data?.profile) {
        let message = data?.message;
        const response = (error as { context?: Response } | null)?.context;
        if (!message && response) { try { message = (await response.clone().json()).message; } catch { /* non-JSON failure */ } }
        throw new Error(message || 'לא ניתן לשלוף את פרטי הרישיון כרגע. נסו שוב מאוחר יותר.');
      }
      if (data.profile.id !== userId || data.profile.broker_license_number !== license) throw new Error('הפרטים שהתקבלו אינם תואמים לפרופיל המבוקש');
      setFound(data.registry ?? { full_name: data.profile.full_name });
       setMissing(false);
      if(typeof data.active==='boolean')onUpdated(data.profile,data.active);else onUpdated(data.profile);
      await Promise.all(['admin-profiles', 'workspaces', 'app-header-user-profile', 'workspace-owner-profile', 'account-identity'].map(key => qc.invalidateQueries({ queryKey: [key] })));
      if (currentScope.current === requestScope) { toast.success(`נשלף מהמאגר: ${data.profile.full_name}${data.registry?.city ? ` · ${data.registry.city}` : ''}`); window.dispatchEvent(new Event('realtyz:profile-saved')); }
    } catch (error) {
      if (currentScope.current !== requestScope) return;
      const message = error instanceof Error ? error.message : 'שליפת פרטי הרישיון נכשלה';
      setErrorMessage(message); toast.error(message,{duration:5000});
    } finally { if (currentScope.current === requestScope) {inFlight.current=false;setBusy(false);} }
  };
  const control = <>
    <Button type="button" variant="ghost" size={presentation==='approved'?'default':'icon'} title={missing ? 'נבדק במאגר הלאומי: לא נמצאה התאמה' : 'איתור מספר רישיון במאגר הלאומי'} aria-label={presentation==='approved'?'בדיקה חוזרת של הרישיון המאושר במאגר הלאומי':'איתור מספר רישיון במאגר הלאומי'} aria-busy={busy} disabled={busy || missing || disabled || !!found || !/^[1-9][0-9]{0,9}$/.test(license)} onClick={() => void fetchName()} className={`shrink-0 border-none p-0 shadow-none hover:bg-transparent hover:opacity-80 ${presentation==='approved'?'h-9 px-1 text-sm font-semibold text-success':`${compact?'h-4 w-4 rounded-none':'h-9 w-9'} ${found?'text-success':missing?'broker-registry-failed':'text-destructive'}`}`}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : presentation==='approved' ? (found?'מאומת':'מאושר') : found ? <ShieldCheck className="h-4 w-4 text-success" /> : <ShieldX className={`h-4 w-4 ${missing?'broker-registry-failed':'text-destructive'}`} />}
    </Button>
  </>;
  if(compact)return control;
  return <div className="min-w-0 space-y-1">
    {control}
    {found && !compact && <p role="status" className="text-sm text-success [overflow-wrap:anywhere]">שם במאגר: <b>{found.full_name}</b>{found.city ? <> · עיר: <b>{found.city}</b></> : null} · הרישיון אומת</p>}
    {errorMessage && !compact && <p role="alert" className="text-sm text-destructive [overflow-wrap:anywhere]">{errorMessage}</p>}
  </div>;
}