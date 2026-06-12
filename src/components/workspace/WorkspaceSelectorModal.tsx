import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Check, Plus, X, LogIn, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkspace, type Workspace } from '@/hooks/useWorkspace';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

function initials(name?: string | null) {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

function roleLabel(role: string, isSelf: boolean) {
  if (isSelf) return 'החשבון שלי · בעלים';
  if (role === 'super_admin') return 'הרשאה: super_admin';
  return `הרשאה: {"role": "${role}"}`;
}

export function WorkspaceSelectorModal() {
  const { user } = useAuth();
  const { workspaces, activeWorkspaceId, setActiveWorkspace, selectorOpen, closeSelector, mustChoose, refresh } = useWorkspace();
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '' });

  // Auto-open when user must choose a workspace on login.
  useEffect(() => {
    if (mustChoose && !selectorOpen) {
      // open via context
      const t = setTimeout(() => {
        const evt = new CustomEvent('workspace:open-selector');
        window.dispatchEvent(evt);
      }, 50);
      return () => clearTimeout(t);
    }
  }, [mustChoose, selectorOpen]);

  const handlePick = async (w: Workspace) => {
    await setActiveWorkspace(w.workspace_owner_id);
    closeSelector();
    toast.success(`התחברת ל${w.workspace_name}`);
  };

  const handleCreate = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      toast.error('יש להזין שם ואימייל');
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('super-admin-create-user', {
        body: {
          email: form.email.trim(),
          full_name: form.name.trim(),
          phone: form.phone.trim() || undefined,
          send_whatsapp: false,
        },
      });
      if (error) throw error;
      toast.success('מרחב העבודה נוצר');
      setShowCreate(false);
      setForm({ name: '', email: '', phone: '' });
      await refresh();
    } catch (err: any) {
      // Fallback: log invitation
      toast.error('יצירת המרחב נכשלה: ' + (err?.message ?? 'שגיאה'));
    } finally {
      setCreating(false);
    }
  };

  const selfRow = workspaces.find((w) => w.is_self);
  const otherRows = workspaces.filter((w) => !w.is_self);

  return (
    <Dialog open={selectorOpen} onOpenChange={(o) => (o ? null : closeSelector())}>
      <DialogContent dir="rtl" className="max-w-md p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 text-right">
          <DialogTitle className="text-lg font-bold">בחר מרחב עבודה להתחברות</DialogTitle>
        </DialogHeader>

        <div className="space-y-2.5 px-5 pb-5 max-h-[70vh] overflow-y-auto">
          {/* Self / personal account row */}
          {selfRow && (
            <button
              type="button"
              onClick={() => handlePick(selfRow)}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-right transition-all hover:ring-2 hover:ring-primary/20',
                activeWorkspaceId === selfRow.workspace_owner_id && 'ring-2 ring-primary border-primary/40',
              )}
            >
              {activeWorkspaceId === selfRow.workspace_owner_id && (
                <Check className="h-4 w-4 text-primary shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{selfRow.owner_full_name || user?.email || 'אני'}</div>
                <div className="text-xs text-muted-foreground">החשבון שלי · בעלים</div>
              </div>
              <Avatar className="h-10 w-10 shrink-0">
                <AvatarImage src={selfRow.owner_avatar_url ?? undefined} />
                <AvatarFallback>{initials(selfRow.owner_full_name || user?.email)}</AvatarFallback>
              </Avatar>
            </button>
          )}

          {/* Other workspaces */}
          {otherRows.map((w) => {
            const active = activeWorkspaceId === w.workspace_owner_id;
            return (
              <button
                key={w.workspace_owner_id}
                type="button"
                onClick={() => handlePick(w)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-right transition-all hover:ring-2 hover:ring-primary/20',
                  active && 'ring-2 ring-primary border-primary/40 bg-primary/5',
                )}
              >
                <div className="flex items-center gap-1.5 shrink-0">
                  <X className="h-3.5 w-3.5 text-muted-foreground/50" />
                  {active && <Check className="h-4 w-4 text-primary" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{w.workspace_name}</div>
                  <div className="text-xs text-muted-foreground truncate">{roleLabel(w.role, w.is_self)}</div>
                </div>
                <Avatar className="h-10 w-10 shrink-0 border bg-background">
                  {w.workspace_logo_url ? (
                    <AvatarImage src={w.workspace_logo_url} className="object-contain p-1" />
                  ) : (
                    <AvatarFallback className="bg-primary/10 text-primary">
                      <Building2 className="h-5 w-5" />
                    </AvatarFallback>
                  )}
                </Avatar>
              </button>
            );
          })}

          {/* Add workspace */}
          {!showCreate ? (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-muted-foreground/30 bg-transparent p-3 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
            >
              <Plus className="h-4 w-4" />
              הוספת מרחב עבודה חדש
            </button>
          ) : (
            <div className="rounded-xl border-2 border-dashed border-primary/30 bg-background p-4 space-y-3 text-right">
              <div className="text-sm font-semibold">מרחב עבודה חדש</div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">שם מלא / שם המרחב</Label>
                <Input dir="rtl" placeholder="לדוגמה: ישראל ישראלי" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">אימייל</Label>
                <Input dir="ltr" type="email" placeholder="user@example.com" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">טלפון (אופציונלי, +972...)</Label>
                <Input dir="ltr" type="tel" placeholder="+972501234567" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)} disabled={creating}>ביטול</Button>
                <Button size="sm" onClick={handleCreate} disabled={creating}>
                  <LogIn className="h-4 w-4 ml-1" />
                  {creating ? 'יוצר...' : 'צור מרחב'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default WorkspaceSelectorModal;
