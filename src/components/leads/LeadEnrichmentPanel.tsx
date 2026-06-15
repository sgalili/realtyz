import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Sparkles, Facebook, Instagram, Linkedin, Music2,
  User, Users as GenderIcon, KeyRound, Loader2, CheckCircle2,
  ChevronDown, ChevronUp, Plus, Trash2, Globe,
} from 'lucide-react';

interface Props {
  lead: any;
  hideEnrichmentButton?: boolean;
}

type SocialPlatform = 'facebook' | 'instagram' | 'tiktok' | 'linkedin' | 'x' | 'youtube' | 'other';

const PLATFORM_META: Record<SocialPlatform, { label: string; icon: JSX.Element }> = {
  facebook:  { label: 'Facebook',  icon: <Facebook className="h-3.5 w-3.5 text-[#1877F2]" /> },
  instagram: { label: 'Instagram', icon: <Instagram className="h-3.5 w-3.5 text-pink-600" /> },
  tiktok:    { label: 'TikTok',    icon: <Music2 className="h-3.5 w-3.5 text-slate-900" /> },
  linkedin:  { label: 'LinkedIn',  icon: <Linkedin className="h-3.5 w-3.5 text-[#0A66C2]" /> },
  x:         { label: 'X',         icon: <Globe className="h-3.5 w-3.5 text-slate-900" /> },
  youtube:   { label: 'YouTube',   icon: <Globe className="h-3.5 w-3.5 text-red-600" /> },
  other:     { label: 'אחר',       icon: <Globe className="h-3.5 w-3.5 text-slate-700" /> },
};

interface SocialEntry { platform: SocialPlatform; handle: string; }

function buildInitialSocials(lead: any, prefs: Record<string, any>): SocialEntry[] {
  const list: SocialEntry[] = Array.isArray(prefs.socials) ? [...prefs.socials] : [];
  if (list.length) return list;
  const seeded: SocialEntry[] = [];
  if (prefs.facebook_url)            seeded.push({ platform: 'facebook',  handle: prefs.facebook_url });
  if (lead.instagram_handle)         seeded.push({ platform: 'instagram', handle: lead.instagram_handle });
  if (prefs.tiktok_handle)           seeded.push({ platform: 'tiktok',    handle: prefs.tiktok_handle });
  if (prefs.linkedin_url)            seeded.push({ platform: 'linkedin',  handle: prefs.linkedin_url });
  return seeded;
}

export default function LeadEnrichmentPanel({ lead, hideEnrichmentButton }: Props) {
  const qc = useQueryClient();
  const prefs = (lead.preferences ?? {}) as Record<string, any>;

  const [age, setAge] = useState<string>(prefs.age ? String(prefs.age) : '');
  const [gender, setGender] = useState<string>(prefs.gender ?? '');
  const [savingField, setSavingField] = useState<string | null>(null);

  const [enriching, setEnriching] = useState(false);

  // Collapsible social section
  const [socialOpen, setSocialOpen] = useState(false);
  const [socials, setSocials] = useState<SocialEntry[]>(() => buildInitialSocials(lead, prefs));

  // Green API credentials
  const [gaOpen, setGaOpen] = useState(false);
  const [gaInstance, setGaInstance] = useState('');
  const [gaToken, setGaToken] = useState('');
  const [gaActive, setGaActive] = useState<boolean>(false);
  const [gaSaving, setGaSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('api_configs')
        .select('is_active, api_key')
        .eq('service_name', 'Green API')
        .maybeSingle();
      if (data?.api_key) {
        setGaActive(!!data.is_active);
        const [inst] = String(data.api_key).split(':');
        setGaInstance(inst ?? '');
      }
    })();
  }, []);

  async function persist(patch: { col?: Record<string, any>; pref?: Record<string, any> }, fieldKey: string) {
    setSavingField(fieldKey);
    try {
      const update: Record<string, any> = { ...(patch.col ?? {}) };
      if (patch.pref) {
        update.preferences = { ...prefs, ...patch.pref };
      }
      const { error } = await supabase.from('leads').update(update as any).eq('id', lead.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['leads-infinite'] });
      toast.success('עודכן');
    } catch (e: any) {
      toast.error(e?.message ?? 'שגיאה בעדכון');
    } finally {
      setSavingField(null);
    }
  }

  async function runEnrichment() {
    setEnriching(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-wa-avatars', {
        body: { lead_ids: [lead.id], force: true },
      });
      if (error) throw error;
      const updated = (data as any)?.updated ?? 0;
      const failed = (data as any)?.failed ?? 0;
      if (updated > 0)      toast.success('תמונת פרופיל סונכרנה מוואטסאפ');
      else if (failed > 0)  toast.warning('לא נמצאה תמונת פרופיל פעילה לאיש קשר זה');
      else                  toast.info('סריקה הושלמה — אין נתונים חדשים להעשרה');
      qc.invalidateQueries({ queryKey: ['leads-infinite'] });
    } catch (e: any) {
      toast.error(e?.message ?? 'שגיאה בסריקה');
    } finally {
      setEnriching(false);
    }
  }

  async function persistSocials(next: SocialEntry[]) {
    setSocials(next);
    const clean = next.filter((s) => s.handle.trim().length > 0);
    await persist({ pref: { socials: clean } }, 'socials');
  }

  async function saveGreenApi() {
    if (!gaInstance.trim() || !gaToken.trim()) {
      toast.error('יש למלא Instance ID ו־Token');
      return;
    }
    setGaSaving(true);
    try {
      const { error } = await supabase
        .from('api_configs')
        .upsert(
          {
            service_name: 'Green API',
            api_key: `${gaInstance.trim()}:${gaToken.trim()}`,
            is_active: true,
          } as any,
          { onConflict: 'service_name' },
        );
      if (error) throw error;
      setGaActive(true);
      setGaToken('');
      toast.success('GreenAPI הוגדר כשער הוואטסאפ הראשי');
    } catch (e: any) {
      toast.error(e?.message ?? 'שמירה נכשלה');
    } finally {
      setGaSaving(false);
    }
  }

  const activeSocialCount = socials.filter((s) => s.handle.trim()).length;

  return (
    <div className="space-y-4">
      <Separator />

      {/* Demographics */}
      <div>
        <h3 className="text-sm font-bold text-slate-900 mb-3">דמוגרפיה</h3>
        <div className="space-y-2">
          <div className="grid grid-cols-[110px_1fr_auto] items-center gap-2">
            <Label className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-slate-700" /> גיל
            </Label>
            <Input
              type="number"
              value={age}
              placeholder="לדוגמה 34"
              onChange={(e) => setAge(e.target.value)}
              onBlur={() => {
                const n = age.trim() === '' ? null : Number(age);
                if (n !== null && (Number.isNaN(n) || n < 0 || n > 120)) {
                  toast.error('גיל לא תקין'); return;
                }
                persist({ pref: { age: n } }, 'age');
              }}
              className="h-8 text-sm"
              dir="ltr"
            />
            {savingField === 'age' ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : <span className="w-3.5" />}
          </div>
          <div className="grid grid-cols-[110px_1fr_auto] items-center gap-2">
            <Label className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <GenderIcon className="h-3.5 w-3.5 text-slate-700" /> מגדר
            </Label>
            <Select
              value={gender || undefined}
              onValueChange={(v) => { setGender(v); persist({ pref: { gender: v } }, 'gender'); }}
            >
              <SelectTrigger className="h-8 text-sm font-semibold text-slate-900"><SelectValue placeholder="בחר מגדר" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="male">זכר</SelectItem>
                <SelectItem value="female">נקבה</SelectItem>
                <SelectItem value="other">אחר</SelectItem>
              </SelectContent>
            </Select>
            {savingField === 'gender' ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : <span className="w-3.5" />}
          </div>
        </div>
      </div>

      <Separator />

      {/* Social Profiles — collapsed by default */}
      <div className="rounded-lg border border-slate-200 bg-slate-50/60">
        <button
          type="button"
          onClick={() => setSocialOpen((s) => !s)}
          className="w-full flex items-center justify-between gap-2 p-3"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-bold text-slate-900">רשתות חברתיות</span>
            <Badge variant="outline" className="text-[10px] font-bold border-slate-300 text-slate-700">
              {activeSocialCount} פעילים
            </Badge>
            <div className="flex items-center gap-1">
              {socials.filter((s) => s.handle.trim()).slice(0, 5).map((s, i) => (
                <span key={i}>{PLATFORM_META[s.platform]?.icon ?? PLATFORM_META.other.icon}</span>
              ))}
            </div>
          </div>
          {socialOpen ? <ChevronUp className="h-4 w-4 text-slate-600" /> : <ChevronDown className="h-4 w-4 text-slate-600" />}
        </button>

        {socialOpen && (
          <div className="px-3 pb-3 space-y-2 border-t border-slate-200 pt-3">
            {socials.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-2">לא הוגדרו פרופילים — הוסף ראשון</p>
            )}
            {socials.map((s, idx) => (
              <div key={idx} className="grid grid-cols-[130px_1fr_auto] items-center gap-2">
                <Select
                  value={s.platform}
                  onValueChange={(v) => {
                    const next = [...socials];
                    next[idx] = { ...next[idx], platform: v as SocialPlatform };
                    persistSocials(next);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs font-semibold text-slate-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PLATFORM_META) as SocialPlatform[]).map((p) => (
                      <SelectItem key={p} value={p}>
                        <span className="flex items-center gap-2">{PLATFORM_META[p].icon} {PLATFORM_META[p].label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={s.handle}
                  placeholder="@handle או URL"
                  onChange={(e) => {
                    const next = [...socials];
                    next[idx] = { ...next[idx], handle: e.target.value };
                    setSocials(next);
                  }}
                  onBlur={() => persistSocials(socials)}
                  className="h-8 text-sm"
                  dir="ltr"
                />
                <button
                  type="button"
                  aria-label="מחק"
                  className="text-slate-500 hover:text-destructive"
                  onClick={() => {
                    const next = socials.filter((_, i) => i !== idx);
                    persistSocials(next);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={() => setSocials((prev) => [...prev, { platform: 'facebook', handle: '' }])}
              className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-primary border border-dashed border-slate-300 rounded-md py-2 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> הוסף פרופיל
            </button>
          </div>
        )}
      </div>

      {!hideEnrichmentButton && (
        <>
          <Separator />
          <Button
            type="button"
            onClick={runEnrichment}
            disabled={enriching}
            className="w-full h-11 text-sm font-bold gap-2 bg-gradient-to-l from-primary to-primary/80"
          >
            {enriching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            סריקת מידע והעשרת פרופיל מהרשת
          </Button>
        </>
      )}

    </div>
  );
}


/* Standalone trigger button so the enrichment CTA can be repositioned
   anywhere in the drawer (e.g. directly under the AI master switch). */
export function LeadEnrichmentButton({ lead }: { lead: any }) {
  const qc = useQueryClient();
  const [enriching, setEnriching] = useState(false);
  async function runEnrichment() {
    setEnriching(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-wa-avatars', {
        body: { lead_ids: [lead.id], force: true },
      });
      if (error) throw error;
      const updated = (data as any)?.updated ?? 0;
      const failed = (data as any)?.failed ?? 0;
      if (updated > 0)      toast.success('תמונת פרופיל סונכרנה מוואטסאפ');
      else if (failed > 0)  toast.warning('לא נמצאה תמונת פרופיל פעילה לאיש קשר זה');
      else                  toast.info('סריקה הושלמה — אין נתונים חדשים להעשרה');
      qc.invalidateQueries({ queryKey: ['leads-infinite'] });
    } catch (e: any) {
      toast.error(e?.message ?? 'שגיאה בסריקה');
    } finally {
      setEnriching(false);
    }
  }
  return (
    <Button
      type="button"
      onClick={runEnrichment}
      disabled={enriching}
      className="w-full h-10 text-sm font-bold gap-2 bg-gradient-to-l from-primary to-primary/80"
    >
      {enriching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
      סריקת מידע והעשרת פרופיל מהרשת
    </Button>
  );
}
