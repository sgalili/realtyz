import { useState } from 'react';
import { Accessibility, Contrast, Link, Type, Pause, Keyboard, RotateCcw, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { DEFAULT_ACCESSIBILITY, readAccessibility, saveAccessibility, type AccessibilityPreferences } from '@/lib/accessibilityPreferences';

const options = [
  { key: 'contrast', label: 'ניגודיות גבוהה', icon: Contrast },
  { key: 'links', label: 'הדגשת קישורים', icon: Link },
  { key: 'motion', label: 'עצירת אנימציות', icon: Pause },
  { key: 'readable', label: 'גופן קריא', icon: Type },
  { key: 'keyboard', label: 'הדגשת ניווט במקלדת', icon: Keyboard },
] as const;

export function AccessibilityMenu() {
  const [preferences, setPreferences] = useState(readAccessibility);
  const update = (patch: Partial<AccessibilityPreferences>) => {
    const next = { ...preferences, ...patch };
    setPreferences(next);
    saveAccessibility(next);
  };
  return <Dialog onOpenChange={open => { if (open) setPreferences(readAccessibility()); }}>
    <DialogTrigger asChild>
      <Button variant="ghost" className="min-h-11 w-full justify-start gap-3 rounded-none px-4 text-foreground" aria-label="פתיחת תפריט נגישות">
        <Accessibility className="h-5 w-5" aria-hidden="true" />נגישות
      </Button>
    </DialogTrigger>
    <DialogContent dir="rtl" data-accessibility-menu overlayClassName="z-[70]" className="z-[71] max-h-[85dvh] overflow-y-auto rounded-lg">
      <DialogHeader><DialogTitle>נגישות</DialogTitle><DialogDescription>התאמות תצוגה אישיות</DialogDescription></DialogHeader>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3">
        <span className="flex items-center gap-2"><Type className="h-5 w-5" aria-hidden="true" />גודל טקסט</span>
        <div className="flex items-center gap-2" dir="ltr">
          <Button size="icon" variant="outline" className="min-h-11 min-w-11" aria-label="הקטנת טקסט" disabled={preferences.textScale <= 1} onClick={() => update({ textScale: Math.max(1, preferences.textScale - 0.1) })}><Minus className="h-4 w-4" /></Button>
          <output aria-live="polite" className="min-w-12 text-center">{Math.round(preferences.textScale * 100)}%</output>
          <Button size="icon" variant="outline" className="min-h-11 min-w-11" aria-label="הגדלת טקסט" disabled={preferences.textScale >= 2} onClick={() => update({ textScale: Math.min(2, preferences.textScale + 0.1) })}><Plus className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="divide-y divide-border">
        {options.map(({ key, label, icon: Icon }) => <div key={key} className="flex min-h-14 items-center justify-between gap-4 py-2">
          <label htmlFor={`accessibility-${key}`} className="flex cursor-pointer items-center gap-2"><Icon className="h-5 w-5 shrink-0" aria-hidden="true" />{label}</label>
          <Switch id={`accessibility-${key}`} checked={preferences[key]} onCheckedChange={checked => update({ [key]: checked })} className="min-h-11 shrink-0" />
        </div>)}
      </div>
      <Button variant="outline" className="min-h-11 gap-2" onClick={() => update(DEFAULT_ACCESSIBILITY)}><RotateCcw className="h-4 w-4" />איפוס התאמות</Button>
    </DialogContent>
  </Dialog>;
}