import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import type { InteractionOutcome } from '@/components/dealroom/OutcomePicker';

export const LOSS_REASONS: Array<{ value: string; labelHe: string }> = [
  { value: 'price_too_high',   labelHe: 'מחיר גבוה מדי' },
  { value: 'not_serious',      labelHe: 'לא רציני' },
  { value: 'location',         labelHe: 'מיקום לא מתאים' },
  { value: 'timing',           labelHe: 'תזמון לא מתאים' },
  { value: 'financing',        labelHe: 'בעיית מימון' },
  { value: 'found_elsewhere',  labelHe: 'מצא במקום אחר' },
  { value: 'other',            labelHe: 'אחר' },
];

interface Props {
  leadId: string;
  outcome: InteractionOutcome | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: () => void;
}

export function LossReasonDialog({ leadId, outcome, open, onOpenChange, onSaved }: Props) {
  const qc = useQueryClient();
  const [reason, setReason] = useState<string>('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setReason(''); setNote(''); }
  }, [open]);

  const isFailure = outcome === 'Closed Lost' || outcome === 'Ghosted';
  if (!isFailure) return null;

  const titleHe = outcome === 'Closed Lost' ? 'מה הסיבה לאובדן העסקה?' : 'למה לדעתך נעלם?';

  const save = async () => {
    if (!reason) { toast.error('בחר/י סיבה'); return; }
    setSaving(true);
    const { error } = await supabase
      .from('leads')
      .update({ loss_reason: reason, loss_reason_note: note.trim() || null })
      .eq('id', leadId);
    setSaving(false);
    if (error) { toast.error('שמירה נכשלה: ' + error.message); return; }
    toast.success('נשמר. תודה — זה משפר את ההמלצות');
    qc.invalidateQueries({ queryKey: ['outcome-intelligence'] });
    qc.invalidateQueries({ queryKey: ['deal-room-leads'] });
    qc.invalidateQueries({ queryKey: ['leads'] });
    onSaved?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>{titleHe}</DialogTitle>
          <DialogDescription>
            סיבה אחת קצרה מספיקה. הנתון נצבר ל-Udi Intelligence ומשפר את ההמלצות העתידיות.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label className="text-xs font-semibold">סיבה</Label>
          <div className="grid grid-cols-2 gap-2">
            {LOSS_REASONS.map((r) => {
              const active = reason === r.value;
              return (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setReason(r.value)}
                  className={`rounded-md border p-2 text-right text-xs transition ${
                    active ? 'border-primary bg-primary/10 font-medium' : 'border-border hover:bg-muted/50'
                  }`}
                >
                  {r.labelHe}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label className="text-xs font-semibold">הערה</Label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="פרט/י בקצרה אם רלוונטי"
            maxLength={500}
            className="min-h-[70px] text-sm"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>דלג</Button>
          <Button onClick={save} disabled={saving || !reason}>שמור סיבה</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
