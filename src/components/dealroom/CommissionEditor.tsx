import { useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface CommissionEditorProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lead: {
    id: string;
    full_name: string | null;
    commission_amount: number | null;
    expected_close_date: string | null;
  };
  onSaved?: () => void;
}

export function CommissionEditor({ open, onOpenChange, lead, onSaved }: CommissionEditorProps) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState<string>(
    lead.commission_amount != null ? String(lead.commission_amount) : '',
  );
  const [closeDate, setCloseDate] = useState<string>(lead.expected_close_date ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const numeric = amount === '' ? null : Number(amount);
    if (numeric != null && (!Number.isFinite(numeric) || numeric < 0)) {
      toast.error('סכום עמלה לא תקין');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('leads')
      .update({
        commission_amount: numeric,
        expected_close_date: closeDate || null,
      })
      .eq('id', lead.id);
    setSaving(false);
    if (error) {
      toast.error('שמירה נכשלה: ' + error.message);
      return;
    }
    toast.success('עמלה נשמרה');
    qc.invalidateQueries({ queryKey: ['business-performance'] });
    qc.invalidateQueries({ queryKey: ['deal-room-leads'] });
    qc.invalidateQueries({ queryKey: ['business-leads'] });
    onSaved?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>עמלה צפויה</DialogTitle>
          <DialogDescription>
            עבור {lead.full_name || 'מתעניין זה'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="commission">עמלה משוערת (₪)</Label>
            <Input
              id="commission"
              type="number"
              inputMode="numeric"
              min={0}
              step={500}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="לדוגמה 24000"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="close-date">תאריך סגירה צפוי</Label>
            <Input
              id="close-date"
              type="date"
              value={closeDate}
              onChange={(e) => setCloseDate(e.target.value)}
              className="mt-1"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              משמש לחישוב "עמלה חודשית צפויה" בלוח הביצועים העסקיים
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            ביטול
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'שומר…' : 'שמור'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
