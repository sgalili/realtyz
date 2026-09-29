import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Mail, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const DOMAIN = 'realtyz.co.il';

const sanitize = (raw: string) =>
  raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 32);

export const EmailAliasSetupDialog = ({
  open,
  onClose,
  onConnected,
}: {
  open: boolean;
  onClose: () => void;
  onConnected: (alias: string) => void;
}) => {
  const [prefix, setPrefix] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data: mb } = await supabase.rpc('get_workspace_mailbox' as never);
      const ownerId = (mb as any)?.owner_id;
      if (!ownerId) return;
      const { data } = await supabase
        .from('profiles')
        .select('email_alias, full_name, email')
        .eq('id', ownerId)
        .maybeSingle();
      const existing = ((data as any)?.email_alias ?? '').trim();
      if (existing) {
        setPrefix(existing);
      } else {
        const fallback =
          (data as any)?.full_name?.split(/\s+/)[0] ||
          (data as any)?.email?.split('@')[0] ||
          '';
        setPrefix(sanitize(fallback));
      }
    })();
  }, [open]);

  const clean = sanitize(prefix);
  const canSubmit = clean.length >= 2 && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc('set_workspace_email_alias' as never, { p_alias: clean } as never);
      if (error) {
        const m = error.message || '';
        toast.error(
          m.includes('alias_taken') || (error as any).code === '23505' ? 'הכתובת תפוסה, בחרו שם אחר'
          : m.includes('alias_reserved') ? 'כתובת זו שמורה למערכת, בחרו שם אחר'
          : m.includes('only_workspace_owner') ? 'רק בעל מרחב העבודה יכול להגדיר את תיבת המייל'
          : m,
        );
        return;
      }
      toast.success(`תיבת המייל של מרחב העבודה: ${clean}@${DOMAIN}`);
      onConnected(clean);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right text-[#0f1b3d] text-lg font-bold flex items-center gap-2 justify-end">
            <Mail className="h-5 w-5 text-[#C9A84C]" />
            הגדרת דואר אלקטרוני מקצועי
          </DialogTitle>
          <DialogDescription className="text-right text-[12px] text-muted-foreground">
            בחרו את ה-prefix של תיבת המייל המותגית שלכם. תיבה אחת לכל מרחב העבודה. כשחשבון Gmail מחובר, השליחה תתבצע דרכו.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-stretch rounded-lg border border-[#0f1b3d]/25 overflow-hidden bg-background focus-within:ring-2 focus-within:ring-[#C9A84C]/60">
            <Input
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              placeholder="udi"
              dir="ltr"
              className="flex-1 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-left font-mono text-base h-11"
            />
            <div className="px-3 flex items-center bg-muted/60 text-[#0f1b3d] font-mono text-sm border-r border-[#0f1b3d]/15">
              @{DOMAIN}
            </div>
          </div>

          {clean && (
            <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-[#C9A84C]" />
              <span dir="ltr" className="font-mono">{clean}@{DOMAIN}</span>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground text-right leading-snug">
            הודעות נכנסות לכתובת זו יישלחו אוטומטית אל ה-CRM שלכם ויקושרו ללקוח התואם.
          </p>
        </div>

        <DialogFooter className="mt-3">
          <Button
            onClick={submit}
            disabled={!canSubmit}
            className="w-full bg-[#0f1b3d] hover:bg-[#1e3a5f] text-white h-11 text-base font-semibold shadow-md"
          >
            {saving ? 'שומר…' : 'אשר והפעל ערוץ'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
