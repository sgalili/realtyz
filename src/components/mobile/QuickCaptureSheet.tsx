import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, NotebookPen } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';

interface QuickCaptureSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Mobile-first Quick Capture sheet.
 * Saves a free-text note straight into the Strategy Bank (knowledge_documents)
 * tagged as "Agent Note" so the AI can learn from it.
 */
export function QuickCaptureSheet({ open, onOpenChange }: QuickCaptureSheetProps) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => { setTitle(''); setBody(''); };

  const handleSave = async () => {
    if (!user) {
      toast.error('יש להתחבר כדי לשמור הערה');
      return;
    }
    const text = body.trim();
    if (!text) {
      toast.error('כתוב/י את ההערה לפני השמירה');
      return;
    }
    setSaving(true);
    try {
      const finalTitle = title.trim() || `הערת סוכן · ${new Date().toLocaleString('he-IL')}`;
      const { error } = await supabase.from('knowledge_documents').insert({
        user_id: user.id,
        title: finalTitle,
        raw_text: text,
        source_type: 'text',
        is_active: true,
        source_metadata: { tag: 'Agent Note', captured_via: 'quick-capture-mobile' },
      });
      if (error) throw error;
      toast.success('ההערה נשמרה במאגר הידע');
      qc.invalidateQueries({ queryKey: ['kb-documents', user.id] });
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'שמירה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        dir="rtl"
        className="rounded-t-2xl px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-4 max-h-[85vh] overflow-y-auto"
      >
        <SheetHeader className="text-right space-y-1">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <NotebookPen className="h-5 w-5 text-primary" />
            לכידה מהירה
          </SheetTitle>
          <SheetDescription className="text-xs">
            הוסף/י הערה מהשטח. תישמר במאגר הידע תחת התגית "Agent Note".
          </SheetDescription>
        </SheetHeader>

        <div className="grid gap-3 py-4">
          <div className="grid gap-1.5">
            <Label htmlFor="qc-title" className="text-xs">כותרת</Label>
            <Input
              id="qc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="לדוגמה: סיור בנכס ברמת השרון"
              className="h-12 text-base"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="qc-body" className="text-xs">הערה</Label>
            <Textarea
              id="qc-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="מה למדת/החלטת/שמעת בשטח?"
              className="min-h-[160px] text-base"
              autoFocus
            />
          </div>
        </div>

        <SheetFooter className="flex-row gap-2">
          <Button
            variant="outline"
            className="flex-1 h-12 text-base"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            ביטול
          </Button>
          <Button
            className="flex-1 h-12 text-base bg-primary text-primary-foreground hover:bg-primary-glow"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : 'שמור במאגר הידע'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
