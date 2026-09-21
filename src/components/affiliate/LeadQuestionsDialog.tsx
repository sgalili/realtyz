// Screening-questions editor for a lead tier.
//
// Three questions are included in the tier price; every extra question adds
// EXTRA_QUESTION_COST to the lead price (80% partner / 20% platform).
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { EXTRA_QUESTION_COST } from '@/lib/leadTiers';

export function LeadQuestionsDialog({
  open,
  onOpenChange,
  title,
  questions,
  onChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  questions: string[];
  onChange: (next: string[]) => void;
}) {
  const extra = Math.max(questions.filter((q) => q.trim()).length - 3, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-lg">
        <DialogHeader><DialogTitle className="text-right">{title}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          {questions.map((q, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-xs text-muted-foreground">{index + 1}.</span>
              <Input value={q} onChange={(event) => onChange(questions.map((item, i) => (i === index ? event.target.value : item)))} />
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label="מחיקת שאלה" onClick={() => onChange(questions.filter((_, i) => i !== index))}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => onChange([...questions, ''])}>
            <Plus className="h-4 w-4" />הוספת שאלה
          </Button>
          <p className="text-xs text-muted-foreground">
            שלוש השאלות הראשונות כלולות במחיר הליד. כל שאלה נוספת מוסיפה ₪{EXTRA_QUESTION_COST} למחיר הליד
            {extra > 0 ? ` (כרגע ${extra} שאלות נוספות · ₪${extra * EXTRA_QUESTION_COST})` : ''}.
          </p>
        </div>
        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <Button variant="outline" onClick={() => onOpenChange(false)}>סגירה</Button>
          <Button onClick={() => onOpenChange(false)}>אישור</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default LeadQuestionsDialog;
