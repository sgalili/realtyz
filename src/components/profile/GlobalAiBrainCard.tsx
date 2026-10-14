import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Brain, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useUserRole } from '@/hooks/useUserRole';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

export function GlobalAiBrainCard() {
  const { isSuperAdmin, loading, error } = useUserRole();
  if (loading || error || !isSuperAdmin) return null;
  return <GlobalAiBrainContent />;
}

function GlobalAiBrainContent() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const { data, isPending, isError } = useQuery({
    queryKey: ['global-ai-config'],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from('global_ai_config').select('master_prompt, updated_at').eq('id', true).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => { if (data) setText(data.master_prompt ?? ''); }, [data]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('global_ai_config')
      .upsert({ id: true, master_prompt: text, updated_by: user?.id ?? null, updated_at: new Date().toISOString() });
    setSaving(false);
    if (error) { toast.error('השמירה נכשלה'); return; }
    toast.success('ההנחיות הגלובליות נשמרו לכל סביבות העבודה');
    void qc.invalidateQueries({ queryKey: ['global-ai-config'] });
  };

  return (
    <Card dir="rtl" id="global-ai-brain" className="border-destructive/40">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="global-ai-brain-body"
        className="flex w-full items-center justify-between gap-3 p-4 text-right">
        <span className="flex min-w-0 items-center gap-2">
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
          <Brain className="h-5 w-5 shrink-0 text-primary" />
          <span className="truncate text-sm font-semibold">מוח AI גלובלי - ריטה</span>
        </span>
      </button>
      {open && (
        <div id="global-ai-brain-body" className="space-y-3 border-t px-4 pb-4 pt-3 text-sm">
          <p className="text-xs text-muted-foreground">הנחיות שנכתבות כאן מוזרקות לכל תשובה של ריטה בכל סביבות העבודה בפלטפורמה.</p>
          {isError ? <p className="text-destructive">לא ניתן לטעון את ההגדרות.</p> : isPending ? <p className="text-muted-foreground">טוען…</p> : <>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} placeholder="לדוגמה: תמיד לענות בעברית תקנית וקצרה" aria-label="הנחיות מערכת גלובליות" />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">{data?.updated_at ? `עודכן: ${new Date(data.updated_at).toLocaleString('he-IL')}` : ''}</span>
              <Button onClick={() => void save()} disabled={saving}>{saving ? 'שומר…' : 'שמירה'}</Button>
            </div>
          </>}
        </div>
      )}
    </Card>
  );
}
