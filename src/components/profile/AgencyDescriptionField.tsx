import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export function AgencyDescriptionField({ value, savedValue, disabled, saving, onChange, onSave }: {
  value: string;
  savedValue: string;
  disabled: boolean;
  saving: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  const dirty = value.trim() !== savedValue.trim();
  return <div className="space-y-1.5" dir="rtl">
    <label htmlFor="agency-description" className="text-base font-semibold">תוכן תיאור החברה</label>
    <Textarea
      id="agency-description"
      value={value}
      maxLength={5000}
      disabled={disabled || saving}
      onChange={event => onChange(event.target.value)}
      onKeyDown={event => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && dirty) {
          event.preventDefault();
          onSave();
        }
      }}
      placeholder="תיאור החברה שיוצג בעמוד המשרד הציבורי"
      className="min-h-36 resize-y text-base leading-relaxed"
    />
    <div className="flex items-center justify-between gap-2">
      <output className="text-sm text-muted-foreground" aria-label="אורך תיאור החברה">{value.length} / 5000</output>
      <Button type="button" size="sm" className="gap-2" disabled={disabled || saving || !dirty} onClick={onSave} aria-label="שמירת תיאור החברה">
        <Check className="h-4 w-4" />{saving ? 'שומר…' : 'שמירת תיאור'}
      </Button>
    </div>
  </div>;
}
