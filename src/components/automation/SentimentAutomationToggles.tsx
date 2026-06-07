import { Switch } from '@/components/ui/switch';
import { useAutoFlags } from '@/hooks/useAutoFlags';
import { cn } from '@/lib/utils';

interface Props {
  className?: string;
}

/**
 * Dual sentiment automation switches. Mounted globally so brokers can
 * flip AI auto-pilot behaviour from either Inbox or Campaigns and have
 * the change reflect across the whole workspace.
 */
export function SentimentAutomationToggles({ className }: Props) {
  const { autoFlags, setAutoFlag } = useAutoFlags();
  const aiPositiveOn = autoFlags.auto_reply_positive === true;
  const aiNegativeOn = autoFlags.auto_reply_negative === true;

  return (
    <div
      dir="rtl"
      className={cn('grid grid-cols-2 gap-3 w-full', className)}
    >
      <label
        className={cn(
          'flex items-center justify-between gap-3 rounded-xl border px-3 py-2 transition-colors cursor-pointer',
          aiPositiveOn
            ? 'border-emerald-200 bg-emerald-50/70'
            : 'border-amber-300 bg-amber-50',
        )}
      >
        <p className="text-sm font-semibold text-slate-800 leading-tight min-w-0">
          {aiPositiveOn ? 'חיוביות: AI' : 'חיוביות: נציג'}
        </p>
        <Switch
          checked={aiPositiveOn}
          onCheckedChange={(v) => setAutoFlag('auto_reply_positive', v)}
        />
      </label>
      <label
        className={cn(
          'flex items-center justify-between gap-3 rounded-xl border px-3 py-2 transition-colors cursor-pointer',
          aiNegativeOn
            ? 'border-emerald-200 bg-emerald-50/70'
            : 'border-amber-300 bg-amber-50',
        )}
      >
        <p className="text-sm font-semibold text-slate-800 leading-tight min-w-0">
          {aiNegativeOn ? 'שליליות: AI' : 'שליליות: נציג'}
        </p>
        <Switch
          checked={aiNegativeOn}
          onCheckedChange={(v) => setAutoFlag('auto_reply_negative', v)}
        />
      </label>
    </div>
  );
}

export default SentimentAutomationToggles;
