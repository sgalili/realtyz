import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Trophy, XCircle, Calendar, UserCheck, Ghost, Tag } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export type InteractionOutcome =
  | 'Qualified'
  | 'Meeting Scheduled'
  | 'Closed Won'
  | 'Closed Lost'
  | 'Ghosted';

export const OUTCOME_OPTIONS: Array<{
  value: InteractionOutcome;
  labelHe: string;
  icon: typeof Tag;
  className: string;
}> = [
  { value: 'Qualified',         labelHe: 'מתעניין מוסמך',  icon: UserCheck, className: 'bg-blue-500/10 text-blue-600 border-blue-500/30' },
  { value: 'Meeting Scheduled', labelHe: 'פגישה נקבעה',     icon: Calendar,  className: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
  { value: 'Closed Won',        labelHe: 'עסקה נסגרה',      icon: Trophy,    className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' },
  { value: 'Closed Lost',       labelHe: 'עסקה אבדה',       icon: XCircle,   className: 'bg-rose-500/10 text-rose-600 border-rose-500/30' },
  { value: 'Ghosted',           labelHe: 'נעלם',             icon: Ghost,     className: 'bg-slate-500/10 text-slate-600 border-slate-500/30' },
];

interface OutcomePickerProps {
  leadId: string;
  value: InteractionOutcome | null | undefined;
  size?: 'sm' | 'md';
  onChanged?: (next: InteractionOutcome | null) => void;
}

export function OutcomeBadge({ value, className }: { value: InteractionOutcome; className?: string }) {
  const opt = OUTCOME_OPTIONS.find((o) => o.value === value);
  if (!opt) return null;
  const Icon = opt.icon;
  return (
    <Badge variant="outline" className={cn('gap-1 font-normal', opt.className, className)}>
      <Icon className="h-3 w-3" />
      {opt.labelHe}
    </Badge>
  );
}

export function OutcomePicker({ leadId, value, size = 'sm', onChanged }: OutcomePickerProps) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const handleChange = async (next: string) => {
    const v = next === '__none__' ? null : (next as InteractionOutcome);
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('leads')
      .update({
        interaction_outcome: v,
        outcome_set_by: u?.user?.id ?? null,
      })
      .eq('id', leadId);
    setSaving(false);
    if (error) {
      toast.error('שמירת תוצאה נכשלה: ' + error.message);
      return;
    }
    toast.success(v ? 'התוצאה נשמרה' : 'התוצאה נוקתה');
    onChanged?.(v);
    qc.invalidateQueries({ queryKey: ['deal-room-leads'] });
    qc.invalidateQueries({ queryKey: ['template-performance'] });
  };

  const triggerH = size === 'sm' ? 'h-7 text-[11px]' : 'h-9 text-xs';

  return (
    <Select
      value={value ?? '__none__'}
      onValueChange={handleChange}
      disabled={saving}
    >
      <SelectTrigger className={cn(triggerH)}>
        <SelectValue placeholder="תייג תוצאת אינטראקציה" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">— ללא תוצאה —</SelectItem>
        {OUTCOME_OPTIONS.map((o) => {
          const Icon = o.icon;
          return (
            <SelectItem key={o.value} value={o.value}>
              <span className="inline-flex items-center gap-2">
                <Icon className="h-3.5 w-3.5" />
                {o.labelHe}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
