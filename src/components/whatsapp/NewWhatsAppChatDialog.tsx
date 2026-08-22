import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { WaTemplatePicker, type WaTemplateSelection } from './WaTemplatePicker';
import { renderTemplateBody, buildTemplateComponents } from '@/hooks/useMetaWaTemplates';
import { useMetaWaTemplates } from '@/hooks/useMetaWaTemplates';


type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the lead id once the template message was dispatched. */
  onStarted: (leadId: string) => void;
  currentUserId?: string | null;
};

function normalizeIL(raw: string): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return null;
  let local = digits;
  if (local.startsWith('972')) local = '0' + local.slice(3);
  if (!/^05\d{8}$/.test(local)) return null;
  return '972' + local.slice(1);
}

/**
 * Starts a NEW business-initiated WhatsApp conversation. Meta only allows this
 * with an approved template, so the template picker is mandatory here.
 */
export const NewWhatsAppChatDialog = ({ open, onOpenChange, onStarted, currentUserId }: Props) => {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [template, setTemplate] = useState<WaTemplateSelection | null>(null);
  const [sending, setSending] = useState(false);
  const { data: templates } = useMetaWaTemplates(open);

  const submit = async () => {
    const intl = normalizeIL(phone);
    if (!intl) {
      toast.error('מספר WhatsApp לא תקין');
      return;
    }
    if (!template?.name) {
      toast.error('יש לבחור תבנית מאושרת של Meta');
      return;
    }
    setSending(true);
    try {
      // 1. Resolve or create the CRM card for this number.
      const { data: existing } = await supabase
        .from('leads').select('id').eq('phone_number', intl).maybeSingle();
      let leadId = (existing as any)?.id as string | undefined;
      if (!leadId) {
        const { data: created, error } = await supabase
          .from('leads')
          .insert({ phone_number: intl, full_name: name.trim() || intl, user_id: currentUserId } as any)
          .select('id')
          .single();
        if (error) throw error;
        leadId = (created as any).id;
      }

      // 2. Dispatch the approved template through the Meta Cloud API.
      const def = templates?.find((t) => t.name === template.name && t.language === template.language);
      const preview = renderTemplateBody(def?.body_text ?? '', template.body_params);
      const components = buildTemplateComponents(def?.body_text ?? '', template.body_params);


      const { data, error: fnError } = await supabase.functions.invoke('send-whatsapp', {
        body: {
          phone_number: intl,
          lead_id: leadId,
          message: preview,
          template_id: template.name,
          template_language: template.language,
          template_components: components,
        },
      });
      if (fnError) throw fnError;
      if (!data?.success) throw new Error(data?.error || 'שליחת התבנית נכשלה');

      toast.success('השיחה נפתחה והתבנית נשלחה');
      onStarted(leadId!);
      onOpenChange(false);
      setPhone('');
      setName('');
    } catch (e: any) {
      toast.error('פתיחת השיחה נכשלה', { description: e?.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>שיחת WhatsApp חדשה</DialogTitle>
          <DialogDescription>
            Meta מאפשרת פתיחת שיחה יזומה רק באמצעות תבנית מאושרת. לאחר תגובת הלקוח ניתן להתכתב בטקסט חופשי
            למשך 24 שעות.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>מספר WhatsApp</Label>
            <Input
              dir="ltr"
              className="bg-blue-50 border-blue-200 text-right"
              placeholder="050-1234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>שם (אופציונלי)</Label>
            <Input
              className="bg-blue-50 border-blue-200"
              placeholder="שם המתעניין"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <WaTemplatePicker value={template} onChange={setTemplate} showTokenHint={false} />

          <Button onClick={submit} disabled={sending} className="w-full">
            {sending ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Send className="ml-2 h-4 w-4" />}
            שלח ופתח שיחה
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default NewWhatsAppChatDialog;
