import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ClipboardList, MessageCircle, Phone, ListChecks, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { LeadFormFieldsEditor } from '@/components/affiliate/LeadFormFieldsDialog';
import { LeadQuestionsEditor } from '@/components/affiliate/LeadQuestionsDialog';
import { cleanFormFields, resolveLeadQuestions, type LeadFormField } from '@/lib/leadTiers';

type Screening = { form_fields: LeadFormField[]; questions: string[]; questions_phone: string[] };

/**
 * Lead management: screening setup for the three lead types, with no prices
 * or rewards. Saving applies to every property in the active workspace and
 * becomes the default for new properties. Rita asks these questions herself.
 */
export function LeadScreeningSettings() {
  const ws = useActiveWorkspaceOwnerId();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Screening | null>(null);
  const [saving, setSaving] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['workspace-lead-screening', ws],
    enabled: !!ws && open,
    queryFn: async (): Promise<Screening> => {
      const { data, error } = await (supabase as any).from('workspace_lead_screening').select('form_fields,questions,questions_phone').eq('workspace_owner_id', ws).maybeSingle();
      if (error) throw error;
      return {
        form_fields: (data?.form_fields as LeadFormField[]) ?? [],
        questions: data ? resolveLeadQuestions(data.questions, null) : resolveLeadQuestions(undefined, null),
        questions_phone: data ? resolveLeadQuestions(data.questions_phone, null) : resolveLeadQuestions(undefined, null),
      };
    },
  });
  useEffect(() => { setDraft(null); }, [ws]);
  const value = draft ?? data ?? null;
  const patch = (p: Partial<Screening>) => value && setDraft({ ...value, ...p });

  const save = async () => {
    if (!value) return;
    setSaving(true);
    const clean = (l: string[]) => l.map((q) => q.trim()).filter(Boolean);
    const { data: res, error } = await (supabase as any).rpc('save_workspace_lead_screening', {
      _form_fields: cleanFormFields(value.form_fields), _questions: clean(value.questions), _questions_phone: clean(value.questions_phone),
    });
    setSaving(false);
    if (error) { toast.error('שמירת שאלות הסינון נכשלה', { description: error.message }); return; }
    toast.success('שאלות הסינון נשמרו', { description: `עודכנו ${res?.listings ?? 0} נכסים, וגם נכסים חדשים יקבלו אותן` });
    setDraft(null);
    void qc.invalidateQueries({ queryKey: ['workspace-lead-screening', ws] });
  };

  const sections = value ? [
    { key: 'form', icon: ClipboardList, title: 'השארת פרטים', hint: 'שדות שהפונה ממלא בטופס בעמוד הנכס', body: <LeadFormFieldsEditor fields={value.form_fields} onChange={(f) => patch({ form_fields: f })} /> },
    { key: 'wa', icon: MessageCircle, title: 'וואטסאפ', hint: 'ריטה שואלת את השאלות האלה בשיחת הוואטסאפ', body: <LeadQuestionsEditor questions={value.questions} onChange={(q) => patch({ questions: q })} /> },
    { key: 'phone', icon: Phone, title: 'שיחת טלפון', hint: 'ריטה שואלת את השאלות האלה בשיחה הקולית', body: <LeadQuestionsEditor questions={value.questions_phone} onChange={(q) => patch({ questions_phone: q })} /> },
  ] : [];

  return (
    <section dir="rtl" className="mb-3 rounded-xl border border-border bg-card">
      <Button type="button" variant="ghost" className="h-auto w-full justify-between gap-2 px-4 py-3 text-start" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="flex items-center gap-2 text-base font-semibold"><ListChecks className="h-5 w-5 text-primary" />שאלות סינון לפי סוג פנייה</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </Button>
      {open && (
        <div className="space-y-4 border-t border-border px-4 py-3">
          <p className="text-sm text-muted-foreground">ריטה מסננת כל פנייה אוטומטית לפי השאלות כאן, כשהיא במצב אוטומטי. אין חיוב נוסף לפנייה.</p>
          {isLoading || !value ? <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /> : sections.map(({ key, icon: Icon, title, hint, body }) => (
            <div key={key} className="space-y-2 rounded-lg border border-border p-3">
              <h3 className="flex items-center gap-2 font-semibold"><Icon className="h-4 w-4 text-primary" />{title}</h3>
              <p className="text-xs text-muted-foreground">{hint}</p>
              {body}
            </div>
          ))}
          <div className="flex justify-end"><Button onClick={save} disabled={!draft || saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}שמירה לכל הנכסים</Button></div>
        </div>
      )}
    </section>
  );
}
