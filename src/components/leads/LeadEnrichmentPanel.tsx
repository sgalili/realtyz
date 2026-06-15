import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  Sparkles, Facebook, Instagram, Linkedin, Music2,
  User, Users as GenderIcon, KeyRound, Loader2, CheckCircle2,
} from 'lucide-react';

interface Props {
  lead: any;
}

// Compact, KI-style enrichment + social + GreenAPI panel.
// Persists age/gender/social URLs inside leads.preferences (no schema change),
// instagram_handle directly on the column, and Green API creds in api_configs.
export default function LeadEnrichmentPanel({ lead }: Props) {
  const qc = useQueryClient();
  const prefs = (lead.preferences ?? {}) as Record<string, any>;

  const [age, setAge] = useState<string>(prefs.age ? String(prefs.age) : '');
  const [gender, setGender] = useState<string>(prefs.gender ?? '');
  const [fb, setFb] = useState<string>(prefs.facebook_url ?? '');
  const [ig, setIg] = useState<string>(lead.instagram_handle ?? '');
  const [tk, setTk] = useState<string>(prefs.tiktok_handle ?? '');
  const [li, setLi] = useState<string>(prefs.linkedin_url ?? '');
  const [savingField, setSavingField] = useState<string | null>(null);

  const [enriching, setEnriching] = useState(false);

  // Green API credentials
  const [gaOpen, setGaOpen] = useState(false);
  const [gaInstance, setGaInstance] = useState('');
  const [gaToken, setGaToken] = useState('');
  const [gaActive, setGaActive] = useState<boolean>(false);
  const [gaSaving, setGaSaving] = useState(false);

  useEffect(() => {
    // Probe Green API config (does not expose value).
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
      const { error } = await supabase.from('leads').update(update).eq('id', lead.id);
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
      // Pull live WhatsApp avatar via existing fetch-wa-avatars edge fn.
      const { data, error } = await supabase.functions.invoke('fetch-wa-avatars', {
        body: { lead_ids: [lead.id], force: true },
      });
      if (error) throw error;
      const updated = (data as any)?.updated ?? 0;
      const failed = (data as any)?.failed ?? 0;
      if (updated > 0) {
        toast.success('תמונת פרופיל סונכרנה מוואטסאפ');
      } else if (failed > 0) {
        toast.warning('לא נמצאה תמונת פרופיל פעילה לאיש קשר זה');
      } else {
        toast.info('סריקה הושלמה — אין נתונים חדשים להעשרה');
      }
      qc.invalidateQueries({ queryKey: ['leads-infinite'] });
    } catch (e: any) {
      toast.error(e?.message ?? 'שגיאה בסריקה');
    } finally {
      setEnriching(false);
    }
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

  const inlineRow = (
    icon: JSX.Element,
    label: string,
    value: string,
    onChange: (v: string) => void,
    fieldKey: string,
    onCommit: () => void,
    placeholder?: string,
    type: string = 'text',
  ) => (
    <div className="grid grid-cols-[110px_1fr_auto] items-center gap-2">
      <Label className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
        {icon}
        {label}
      </Label>
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        className="h-8 text-sm"
        dir={type === 'number' ? 'ltr' : undefined}
      />
      {savingField === fieldKey ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      ) : (
        <span className="w-3.5" />
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <Separator />

      {/* Demographics */}
      <div>
        <h3 className="text-sm font-bold text-slate-900 mb-3">דמוגרפיה</h3>
        <div className="space-y-2">
          {inlineRow(
            <User className="h-3.5 w-3.5 text-slate-700" />,
            'גיל',
            age,
            setAge,
            'age',
            () => {
              const n = age.trim() === '' ? null : Number(age);
              if (n !== null && (Number.isNaN(n) || n < 0 || n > 120)) {
                toast.error('גיל לא תקין');
                return;
              }
              persist({ pref: { age: n } }, 'age');
            },
            'לדוגמה 34',
            'number',
          )}
          <div className="grid grid-cols-[110px_1fr_auto] items-center gap-2">
            <Label className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <GenderIcon className="h-3.5 w-3.5 text-slate-700" />
              מגדר
            </Label>
            <div className="flex gap-2">
              {[
                { v: 'male', l: 'זכר' },
                { v: 'female', l: 'נקבה' },
                { v: 'other', l: 'אחר' },
              ].map((opt) => (
                <Button
                  key={opt.v}
                  type="button"
                  variant={gender === opt.v ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 flex-1"
                  onClick={() => {
                    setGender(opt.v);
                    persist({ pref: { gender: opt.v } }, 'gender');
                  }}
                >
                  {opt.l}
                </Button>
              ))}
            </div>
            {savingField === 'gender' && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>
        </div>
      </div>

      <Separator />

      {/* Social Profiles */}
      <div>
        <h3 className="text-sm font-bold text-slate-900 mb-3">רשתות חברתיות</h3>
        <div className="space-y-2">
          {inlineRow(
            <Facebook className="h-3.5 w-3.5 text-[#1877F2]" />,
            'פייסבוק',
            fb,
            setFb,
            'fb',
            () => persist({ pref: { facebook_url: fb.trim() || null } }, 'fb'),
            'facebook.com/username',
          )}
          {inlineRow(
            <Instagram className="h-3.5 w-3.5 text-pink-600" />,
            'אינסטגרם',
            ig,
            setIg,
            'ig',
            () => persist({ col: { instagram_handle: ig.trim() || null } }, 'ig'),
            '@handle',
          )}
          {inlineRow(
            <Music2 className="h-3.5 w-3.5 text-slate-900" />,
            'טיקטוק',
            tk,
            setTk,
            'tk',
            () => persist({ pref: { tiktok_handle: tk.trim() || null } }, 'tk'),
            '@handle',
          )}
          {inlineRow(
            <Linkedin className="h-3.5 w-3.5 text-[#0A66C2]" />,
            'לינקדאין',
            li,
            setLi,
            'li',
            () => persist({ pref: { linkedin_url: li.trim() || null } }, 'li'),
            'linkedin.com/in/...',
          )}
        </div>
      </div>

      <Separator />

      {/* Web enrichment trigger */}
      <Button
        type="button"
        onClick={runEnrichment}
        disabled={enriching}
        className="w-full h-11 text-sm font-bold gap-2 bg-gradient-to-l from-primary to-primary/80"
      >
        {enriching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        סריקת מידע והעשרת פרופיל מהרשת
      </Button>
      <p className="text-[11px] text-muted-foreground text-center -mt-2">
        מסנכרן תמונת פרופיל חיה מוואטסאפ דרך GreenAPI ומעדכן שדות חסרים
      </p>

      {/* GreenAPI inline setup */}
      <div className="rounded-lg border border-emerald-300/60 bg-emerald-50/40 p-3 space-y-2">
        <button
          type="button"
          onClick={() => setGaOpen((s) => !s)}
          className="w-full flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-emerald-700" />
            <span className="text-sm font-bold text-slate-900">שער WhatsApp ראשי — GreenAPI</span>
          </div>
          {gaActive ? (
            <Badge className="bg-emerald-600 hover:bg-emerald-600 gap-1">
              <CheckCircle2 className="h-3 w-3" /> מחובר
            </Badge>
          ) : (
            <Badge variant="outline" className="border-amber-400 text-amber-700">לא מוגדר</Badge>
          )}
        </button>

        {gaOpen && (
          <div className="space-y-2 pt-2 border-t border-emerald-200">
            <div>
              <Label className="text-xs font-semibold text-slate-900">Instance ID</Label>
              <Input
                value={gaInstance}
                onChange={(e) => setGaInstance(e.target.value)}
                placeholder="1101000001"
                className="h-8 mt-1"
                dir="ltr"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-900">API Token</Label>
              <Input
                type="password"
                value={gaToken}
                onChange={(e) => setGaToken(e.target.value)}
                placeholder="••••••••••••"
                className="h-8 mt-1"
                dir="ltr"
              />
            </div>
            <Button
              type="button"
              size="sm"
              className="w-full"
              onClick={saveGreenApi}
              disabled={gaSaving}
            >
              {gaSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'שמור והגדר כשער ראשי'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
