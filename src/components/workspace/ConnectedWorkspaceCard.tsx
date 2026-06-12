import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftRight, Building2, Camera, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const ACCOUNT_TYPES = [
  { value: 'real_estate', label: 'נדל"ן' },
  { value: 'agency', label: 'סוכנות' },
  { value: 'broker_solo', label: 'מתווך עצמאי' },
  { value: 'developer', label: 'יזם' },
  { value: 'national_elections', label: 'בחירות ארציות' },
];

function initials(name?: string | null) {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

export function ConnectedWorkspaceCard() {
  const { activeWorkspace, openSelector, refresh } = useWorkspace();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(activeWorkspace?.workspace_name ?? '');
  const [accountType, setAccountType] = useState(activeWorkspace?.account_type ?? 'real_estate');
  const [saving, setSaving] = useState(false);

  if (!activeWorkspace) return null;

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('workspace_memberships')
        .update({ workspace_name: name, account_type: accountType })
        .eq('user_id', activeWorkspace.user_id)
        .eq('workspace_owner_id', activeWorkspace.workspace_owner_id);
      if (error) throw error;
      await refresh();
      toast.success('פרטי המרחב נשמרו');
    } catch (err: any) {
      toast.error('שמירה נכשלה: ' + (err?.message ?? 'שגיאה'));
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <>
      <div dir="rtl" className="relative rounded-2xl border bg-card p-4 text-right shadow-sm">
        <button
          type="button"
          onClick={openSelector}
          aria-label="החלף מרחב עבודה"
          className="absolute top-3 left-3 flex h-9 w-9 items-center justify-center rounded-lg border bg-background text-muted-foreground hover:text-primary hover:border-primary/40 transition"
        >
          <ArrowLeftRight className="h-4 w-4" />
        </button>

        <div className="flex flex-col items-center gap-2 pb-3">
          <div className="relative">
            <Avatar className="h-20 w-20 border-2 bg-background">
              {activeWorkspace.workspace_logo_url ? (
                <AvatarImage src={activeWorkspace.workspace_logo_url} className="object-contain p-1" />
              ) : (
                <AvatarFallback className="bg-primary/10 text-primary">
                  <Building2 className="h-8 w-8" />
                </AvatarFallback>
              )}
            </Avatar>
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
              <Camera className="h-3 w-3" />
            </span>
          </div>
          <div className="text-base font-bold">{activeWorkspace.workspace_name}</div>
        </div>

        <div className="space-y-3 rounded-xl border bg-background/60 p-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">שם המשרד / סוכנות</Label>
            <Input dir="rtl" value={name} onChange={(e) => setName(e.target.value)} className="text-right" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">סוג חשבון</Label>
            <Select value={accountType ?? undefined} onValueChange={setAccountType}>
              <SelectTrigger dir="rtl" className="text-right">
                <SelectValue />
              </SelectTrigger>
              <SelectContent dir="rtl">
                {ACCOUNT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value} className="text-right">{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={save} disabled={saving} size="sm" className="w-full">
            {saving ? 'שומר...' : 'שמירת פרטי המרחב'}
          </Button>
        </div>
      </div>

      <div className="flex justify-center pt-2">
        <Button
          variant="outline"
          onClick={handleSignOut}
          className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="h-4 w-4 ml-2 rotate-180" />
          התנתק
        </Button>
      </div>
    </>
  );
}

export default ConnectedWorkspaceCard;
