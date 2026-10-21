import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { RealtyzLoader } from '@/components/RealtyzLoader';
import { useAuth } from '@/hooks/useAuth';
import { userRolesQueryKey } from '@/hooks/useUserRole';
import { SIGNUP_ROLE_LABELS, clearPendingSignupRole, type SignupRole } from '@/lib/signupRole';
import realtyzLogo from '@/assets/realtyz-logo.png';

export const PRIMARY_SIGNUP_TYPES = ['broker', 'developer', 'contractor', 'property_owner', 'property_seeker'] as const;
export function RoleChoiceStep({ onDone }: { onDone?: () => void }) {
  const [busy, setBusy] = useState<SignupRole | null>(null);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const pick = async (type: typeof PRIMARY_SIGNUP_TYPES[number]) => {
    if (busy || !user) return;
    setBusy(type);
    try {
      const { data, error } = await supabase.rpc('select_signup_user_type', { _type: type });
      if (error) throw error;
      if (!(data as { ok?: boolean } | null)?.ok) throw new Error('בחירת סוג המשתמש לא נשמרה');
      clearPendingSignupRole();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: userRolesQueryKey(user.id) }),
        queryClient.invalidateQueries({ queryKey: ['workspace-owner-roles'] }),
        queryClient.invalidateQueries({ queryKey: ['primary-user-type'] }),
      ]);
      onDone?.();
      navigate(type === 'developer' || type === 'contractor' ? '/developer-dashboard?onboarding=1' : type === 'property_owner' ? '/owner/properties' : type === 'property_seeker' ? '/public-listings' : '/dashboard', { replace: true });
    } catch {
      toast.error('לא ניתן לשמור את סוג המשתמש. נסו שוב.');
      setBusy(null);
    }
  };
  return <div dir="rtl" className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6">
    <img src={realtyzLogo} alt="Realtyz AI" className="h-14 w-auto object-contain" />
    <h1 className="text-xl font-bold">מה סוג המשתמש שלך?</h1>
    <div className="grid w-full max-w-lg grid-cols-2 gap-3">{PRIMARY_SIGNUP_TYPES.map(type => <Button key={type} variant="outline" className="h-auto whitespace-normal py-6 text-lg font-bold" disabled={!!busy} onClick={() => void pick(type)}>{SIGNUP_ROLE_LABELS[type]}</Button>)}</div>
    {busy && <RealtyzLoader size="sm" label="שומר את סוג המשתמש..." />}
  </div>;
}
export default RoleChoiceStep;