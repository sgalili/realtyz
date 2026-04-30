import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type DelayUnit = 'sec' | 'min' | 'hour' | 'day';
const UNIT_LABELS: Record<DelayUnit, string> = { sec: 'שניות', min: 'דקות', hour: 'שעות', day: 'ימים' };

type DeliverySettingsProps = {
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  dailyLimit: number;
  onDailyLimitChange: (value: number) => void;
  windowStart: string;
  onWindowStartChange: (value: string) => void;
  windowEnd: string;
  onWindowEndChange: (value: string) => void;
  delayMin: number;
  onDelayMinChange: (value: number) => void;
  delayMax: number;
  onDelayMaxChange: (value: number) => void;
  compact?: boolean;
  testPhone?: string;
  onTestPhoneChange?: (value: string) => void;
  onTestSend?: () => void;
};

export function DeliverySettings({
  enabled,
  onEnabledChange,
  dailyLimit,
  onDailyLimitChange,
  windowStart,
  onWindowStartChange,
  windowEnd,
  onWindowEndChange,
  delayMin,
  onDelayMinChange,
  delayMax,
  onDelayMaxChange,
  compact = false,
  testPhone,
  onTestPhoneChange,
  onTestSend,
}: DeliverySettingsProps) {
  const [delayUnit, setDelayUnit] = useState<DelayUnit>('min');
  const safeDelay = Math.max(delayMin, Math.min(delayMax, 240));

  return (
    <div className="space-y-3" dir="rtl">
      <div className="flex items-center justify-between rounded-md border border-border bg-card p-3">
        <div className="flex items-center gap-2">
          <div>
            <Label className="text-sm font-semibold">הגדרות שליחה</Label>
            {!compact && <p className="text-xs text-muted-foreground">הגבלת קצב, חלון זמן והשהייה אקראית להגנה מסימון כספאם.</p>}
          </div>
        </div>
        <Switch checked={enabled} onCheckedChange={onEnabledChange} />
      </div>

      {enabled && (
        <>
          <div className="flex flex-wrap gap-3">
            <div className="space-y-1">
              <Label className="text-xs">מקסימום יומי</Label>
              <Input type="number" min="1" value={dailyLimit} onChange={(e) => onDailyLimitChange(Number(e.target.value))} className="w-20" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">חלון שעות</Label>
              <div className="flex items-center gap-1">
                <Input type="time" value={windowEnd} onChange={(e) => onWindowEndChange(e.target.value)} className="w-24 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none" />
                <span className="text-xs text-muted-foreground">-</span>
                <Input type="time" value={windowStart} onChange={(e) => onWindowStartChange(e.target.value)} className="w-24 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">השהייה אקראית</Label>
              <div className="flex gap-1">
                <Input
                  type="number"
                  min="1"
                  value={delayMax}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    onDelayMinChange(v);
                    onDelayMaxChange(v);
                  }}
                  className="w-14"
                />
                <Select value={delayUnit} onValueChange={(v) => setDelayUnit(v as DelayUnit)}>
                  <SelectTrigger className="w-20 px-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(UNIT_LABELS) as DelayUnit[]).map((u) => (
                      <SelectItem key={u} value={u}>{UNIT_LABELS[u]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="rounded-md bg-primary/5 p-2 text-xs text-muted-foreground">
            <span>המערכת תשלח עד {dailyLimit.toLocaleString()} ביום, רק בין {windowStart}-{windowEnd}, עם {delayMin}-{safeDelay} {UNIT_LABELS[delayUnit]} בין הודעות.</span>
          </div>
        </>
      )}

      {onTestPhoneChange && (
        <div className="space-y-1 max-w-sm">
          <Label className="text-xs">מספר בדיקה</Label>
          <div className="flex gap-1">
            <Input value={testPhone ?? ''} onChange={(e) => onTestPhoneChange(e.target.value)} placeholder="05X-XXXXXXX" dir="rtl" inputMode="tel" className="text-right" />
            <Button type="button" variant="outline" size="sm" onClick={onTestSend} className="shrink-0">שלח</Button>
          </div>
        </div>
      )}
    </div>
  );
}
