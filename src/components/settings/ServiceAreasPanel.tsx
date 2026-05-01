/**
 * ServiceAreasPanel
 * -----------------
 * "Area of Expertise" (אזור התמחות) section in Settings.
 *
 * Lets the agent pick from a curated list of Israeli cities + neighborhoods
 * AND free-type custom areas (e.g. "תל אביב - קרית שלום"). The selection is
 * persisted to `profiles.service_areas` (text[]) and powers the global
 * hyper-local filter on Dashboard / Deal Room / Properties.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useServiceAreas } from '@/hooks/useServiceAreas';
import { ALL_AREA_OPTIONS, CURATED_SERVICE_AREAS } from '@/lib/serviceAreas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Plus, X, MapPin, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function ServiceAreasPanel() {
  const { user } = useAuth();
  const { serviceAreas, invalidate, isLoading } = useServiceAreas();
  const qc = useQueryClient();

  const [draft, setDraft] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState('');
  const [saving, setSaving] = useState(false);

  // Initialize the local draft from the loaded value.
  useEffect(() => {
    setDraft(serviceAreas);
  }, [serviceAreas.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const draftSet = useMemo(() => new Set(draft), [draft]);

  function toggle(label: string) {
    setDraft((d) =>
      d.includes(label) ? d.filter((x) => x !== label) : [...d, label],
    );
  }

  function addCustom() {
    const v = customInput.trim();
    if (!v) return;
    if (draft.includes(v)) {
      toast.info('האזור כבר נבחר');
      setCustomInput('');
      return;
    }
    setDraft((d) => [...d, v]);
    setCustomInput('');
  }

  function remove(label: string) {
    setDraft((d) => d.filter((x) => x !== label));
  }

  async function save() {
    if (!user?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ service_areas: draft } as any)
        .eq('id', user.id);
      if (error) throw error;
      toast.success('אזור ההתמחות נשמר', {
        description: `מהיום הדשבורד, העסקאות והנכסים יוצגו לפי ${draft.length} אזורים`,
      });
      invalidate();
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['deal-room-leads'] });
    } catch (e: any) {
      toast.error('שמירת אזור ההתמחות נכשלה', { description: e?.message });
    } finally {
      setSaving(false);
    }
  }

  const dirty = useMemo(() => {
    if (draft.length !== serviceAreas.length) return true;
    const a = [...draft].sort();
    const b = [...serviceAreas].sort();
    return a.some((x, i) => x !== b[i]);
  }, [draft, serviceAreas]);

  return (
    <Card dir="rtl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="h-4 w-4 text-primary" />
          אזור התמחות
        </CardTitle>
        <CardDescription className="text-xs">
          הגדירו את הערים והשכונות שאתם מתמחים בהן. הדשבורד, העסקאות והנכסים
          יוצגו אוטומטית לפי האזורים האלה. ה-AI ידע למקד את התשובות לאזור שלכם.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Selected chips */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground">
            אזורים שנבחרו ({draft.length})
          </div>
          {draft.length === 0 ? (
            <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
              עדיין לא הוגדר אזור. בחרו לפחות אזור אחד מהרשימה למטה כדי להפעיל את
              הסינון ההיפר-לוקאלי.
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {draft.map((a) => (
                <Badge
                  key={a}
                  variant="secondary"
                  className="gap-1 pe-1 ps-2 text-xs font-medium"
                >
                  {a}
                  <button
                    type="button"
                    onClick={() => remove(a)}
                    className="rounded-full hover:bg-destructive/15 hover:text-destructive p-0.5 transition-colors"
                    aria-label={`הסר ${a}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Custom add */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground">
            הוספה מותאמת אישית
          </div>
          <div className="flex gap-2">
            <Input
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCustom();
                }
              }}
              placeholder='לדוגמה: רעננה - מערב'
              className="h-9 text-sm"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addCustom}
              disabled={!customInput.trim()}
            >
              <Plus className="h-4 w-4 me-1" /> הוסף
            </Button>
          </div>
        </div>

        {/* Curated picker */}
        <div className="space-y-3">
          <div className="text-xs font-semibold text-muted-foreground">
            רשימה מוכנה (לחצו לבחירה / ביטול)
          </div>
          <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
            {CURATED_SERVICE_AREAS.map(({ city, neighborhoods }) => (
              <div key={city} className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => toggle(city)}
                  className={`text-xs font-bold rounded-md px-2 py-1 transition-colors ${
                    draftSet.has(city)
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted hover:bg-muted/70 text-foreground'
                  }`}
                >
                  {city}
                </button>
                <div className="flex flex-wrap gap-1.5 pr-1">
                  {neighborhoods.map((n) => {
                    const label = `${city} - ${n}`;
                    const active = draftSet.has(label);
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => toggle(label)}
                        className={`text-[11px] rounded-md px-2 py-0.5 border transition-colors ${
                          active
                            ? 'bg-primary/15 border-primary/40 text-primary font-semibold'
                            : 'bg-background border-border text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {n}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Save */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="text-[11px] text-muted-foreground">
            {dirty ? 'יש שינויים שלא נשמרו' : 'הכל שמור'}
          </div>
          <Button onClick={save} disabled={!dirty || saving || isLoading} size="sm">
            {saving ? (
              <Loader2 className="h-4 w-4 me-1 animate-spin" />
            ) : (
              <Save className="h-4 w-4 me-1" />
            )}
            שמור אזור התמחות
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default ServiceAreasPanel;

// Suppress "ALL_AREA_OPTIONS unused" lint by re-exporting it conceptually here
// (it's also imported elsewhere from '@/lib/serviceAreas').
export { ALL_AREA_OPTIONS };
