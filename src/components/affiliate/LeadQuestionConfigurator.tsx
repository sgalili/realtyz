import { useState } from 'react';
import { ChevronDown, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LeadFormFieldsEditor } from './LeadFormFieldsDialog';
import { LeadQuestionsEditor } from './LeadQuestionsDialog';
import { resolveLeadQuestions, type LeadFormField } from '@/lib/leadTiers';

type Props = { tier: 'form' | 'whatsapp' | 'phone'; dealType?: string | null; questions?: string[]; fields?: LeadFormField[]; onQuestionsChange?: (questions: string[]) => void; onFieldsChange?: (fields: LeadFormField[]) => void; disabled?: boolean };

export function LeadQuestionConfigurator({ tier, dealType, questions, fields = [], onQuestionsChange, onFieldsChange, disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const list = resolveLeadQuestions(questions, dealType);
  const title = tier === 'form' ? 'שדות טופס הפנייה' : `שאלות סינון ${tier === 'phone' ? 'בטלפון' : 'בוואטסאפ'}`;
  return <div className="min-w-0 border-t border-border pt-2">
    <Button type="button" variant="ghost" className="h-auto w-full justify-between gap-2 whitespace-normal px-0 py-1 text-start text-sm" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <span key="title" className="flex min-w-0 items-center gap-2"><ListChecks className="h-4 w-4 shrink-0" />{title} ({tier === 'form' ? fields.length : list.length})</span><ChevronDown key="expand" className={`h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
    </Button>
    {open && <fieldset disabled={disabled} className="min-w-0 space-y-2 py-2">{tier === 'form'
      ? <LeadFormFieldsEditor fields={fields} onChange={next => onFieldsChange?.(next)} />
      : <LeadQuestionsEditor questions={list} onChange={next => onQuestionsChange?.(next)} />}</fieldset>}
  </div>;
}