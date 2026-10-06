// Form builder for the level-1 lead form. Name + phone are always required and
// free; every extra field adds EXTRA_QUESTION_COST to the lead price.
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EXTRA_QUESTION_COST, FORM_FIELD_TYPE_LABELS, type LeadFormField, type LeadFormFieldType } from '@/lib/leadTiers';

const newField = (): LeadFormField => ({ id: crypto.randomUUID().slice(0, 8), label: '', type: 'text', required: true, options: [] });
const needsOptions = (t: LeadFormFieldType) => t === 'single' || t === 'multi';

export function LeadFormFieldsDialog({ open, onOpenChange, fields, onChange }: {
  open: boolean; onOpenChange: (v: boolean) => void; fields: LeadFormField[]; onChange: (next: LeadFormField[]) => void;
}) {
  const update = (i: number, patch: Partial<LeadFormField>) => onChange(fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const count = fields.filter((f) => f.label.trim()).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle className="text-right">שדות טופס הפנייה</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg border bg-muted/40 p-2.5 text-xs text-muted-foreground">שם מלא ומספר טלפון הם שדות חובה קבועים וכלולים במחיר.</div>
          {fields.map((f, i) => (
            <div key={f.id} className="space-y-2 rounded-lg border p-2.5">
              <div className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-xs text-muted-foreground">{i + 1}.</span>
                <Input placeholder="נוסח השדה, למשל: מתי תרצו להיכנס?" value={f.label} maxLength={120} onChange={(e) => update(i, { label: e.target.value })} />
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label="מחיקת שדה" onClick={() => onChange(fields.filter((_, idx) => idx !== i))}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-3 ps-7">
                <Select value={f.type} onValueChange={(v) => update(i, { type: v as LeadFormFieldType, options: needsOptions(v as LeadFormFieldType) ? (f.options?.length ? f.options : ['', '']) : [] })}>
                  <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(FORM_FIELD_TYPE_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                </Select>
                <label className="flex items-center gap-1.5 text-xs"><Checkbox checked={f.required} onCheckedChange={(c) => update(i, { required: Boolean(c) })} />שדה חובה</label>
              </div>
              {needsOptions(f.type) && (
                <div className="space-y-1.5 ps-7">
                  {(f.options ?? []).map((o, oi) => (
                    <div key={oi} className="flex items-center gap-2">
                      <Input className="h-8 text-xs" placeholder={`אפשרות ${oi + 1}`} value={o} maxLength={80} onChange={(e) => update(i, { options: (f.options ?? []).map((x, xi) => (xi === oi ? e.target.value : x)) })} />
                      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" aria-label="מחיקת אפשרות" onClick={() => update(i, { options: (f.options ?? []).filter((_, xi) => xi !== oi) })}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  ))}
                  <button type="button" className="text-xs font-semibold text-primary" onClick={() => update(i, { options: [...(f.options ?? []), ''] })}>+ הוספת אפשרות</button>
                </div>
              )}
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => onChange([...fields, newField()])}><Plus className="h-4 w-4" />הוספת שדה</Button>
          <p className="text-xs text-muted-foreground">כל שדה נוסף מוסיף ₪{EXTRA_QUESTION_COST} למחיר הפנייה{count > 0 ? ` (כרגע ${count} שדות · ₪${count * EXTRA_QUESTION_COST})` : ''}.</p>
        </div>
        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <Button variant="outline" onClick={() => onOpenChange(false)}>סגירה</Button>
          <Button onClick={() => onOpenChange(false)}>אישור</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default LeadFormFieldsDialog;
