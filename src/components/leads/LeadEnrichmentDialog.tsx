import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, Globe, Facebook, Instagram, Linkedin, Music2, User2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { RealtyzLoader } from '@/components/RealtyzLoader';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lead: any;
}

type Finding = {
  key: string;
  label: string;
  value: string;
  source?: string;
  target: 'column' | 'preference' | 'social';
  column?: string;
  platform?: string;
};

const iconFor = (platform?: string) => {
  switch ((platform || '').toLowerCase()) {
    case 'facebook': return <Facebook className="h-3.5 w-3.5 text-[#1877F2]" />;
    case 'instagram': return <Instagram className="h-3.5 w-3.5 text-pink-600" />;
    case 'linkedin': return <Linkedin className="h-3.5 w-3.5 text-[#0A66C2]" />;
    case 'tiktok': return <Music2 className="h-3.5 w-3.5" />;
    default: return <Globe className="h-3.5 w-3.5 text-slate-500" />;
  }
};

export default function LeadEnrichmentDialog({ open, onOpenChange, lead }: Props) {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [summary, setSummary] = useState<string>('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [applying, setApplying] = useState(false);

  const runScan = async () => {
    setLoading(true);
    setFindings(null);
    setSummary('');
    try {
      const { data, error } = await supabase.functions.invoke('enrich-lead-web', {
        body: { lead_id: lead.id },
      });
      if (error) throw error;
      const list: Finding[] = (data as any)?.findings ?? [];
      setFindings(list);
      setSummary((data as any)?.summary ?? '');
      const sel: Record<string, boolean> = {};
      list.forEach((f) => { sel[f.key] = true; });
      setSelected(sel);
      if (!list.length) toast.info('לא נמצאו נתונים חדשים ברשת');
    } catch (e: any) {
      toast.error('הסריקה נכשלה', { description: e?.message ?? '' });
    } finally {
      setLoading(false);
    }
  };

  const applyChanges = async () => {
    if (!findings) return;
    const chosen = findings.filter((f) => selected[f.key]);
    if (!chosen.length) { onOpenChange(false); return; }
    setApplying(true);
    try {
      const prefs = { ...(lead.preferences ?? {}) } as Record<string, any>;
      const colUpdate: Record<string, any> = {};
      const socials: any[] = Array.isArray(prefs.socials) ? [...prefs.socials] : [];
      const setSocial = (platform: string, value: string) => {
        const idx = socials.findIndex((s) => s?.platform === platform);
        if (idx >= 0) socials[idx] = { ...socials[idx], handle: value };
        else socials.push({ platform, handle: value });
      };
      for (const f of chosen) {
        if (f.target === 'column' && f.column) {
          colUpdate[f.column] = f.value;
        } else if (f.target === 'social' && f.platform) {
          setSocial(f.platform, f.value);
          // Mirror onto the legacy fields the CRM already reads so the profile
          // page reflects the change even before `socials[]` is expanded.
          if (f.platform === 'instagram') colUpdate.instagram_handle = f.value.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/$/, '');
          else if (f.platform === 'facebook') prefs.facebook_url = f.value;
          else if (f.platform === 'linkedin') prefs.linkedin_url = f.value;
          else if (f.platform === 'tiktok')   prefs.tiktok_handle = f.value;
          else if (f.platform === 'x')        prefs.x_handle = f.value;
          else if (f.platform === 'youtube')  prefs.youtube_url = f.value;
        } else if (f.target === 'preference') {
          prefs[f.key] = f.value;
          // Preference keys that are actually social URLs — mirror into socials[].
          if (f.key === 'facebook_url')  setSocial('facebook', f.value);
          if (f.key === 'linkedin_url')  setSocial('linkedin', f.value);
          if (f.key === 'tiktok_handle') setSocial('tiktok', f.value);
          if (f.key === 'x_handle')      setSocial('x', f.value);
          if (f.key === 'youtube_url')   setSocial('youtube', f.value);
        }
      }
      prefs.socials = socials;
      const update: Record<string, any> = { ...colUpdate, preferences: prefs };
      const { error } = await supabase.from('leads').update(update as any).eq('id', lead.id);
      if (error) throw error;
      toast.success(`עודכנו ${chosen.length} שדות בפרופיל`);
      qc.invalidateQueries({ queryKey: ['leads-infinite'] });
      qc.invalidateQueries({ queryKey: ['lead', lead.id] });
      onOpenChange(false);
    } catch (e: any) {
      console.error('[enrich apply]', e);
      toast.error(e?.message ?? 'שגיאה בעדכון הפרופיל');
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!applying) onOpenChange(v); }}>
      <DialogContent className="max-w-lg text-right" dir="rtl">
        <DialogHeader className="text-right">
          <DialogTitle className="flex items-center gap-2 justify-start">
            <Sparkles className="h-5 w-5 text-primary" />
            סריקת מידע מהרשת
          </DialogTitle>
          <DialogDescription className="text-right">
            סורק את הרשת ורשתות חברתיות בחיפוש מידע פומבי על {lead.full_name || 'המתעניין'}
          </DialogDescription>
        </DialogHeader>

        {!findings && !loading && (
          <div className="py-8 flex flex-col items-center gap-4">
            <div className="text-sm text-muted-foreground text-center">
              נחפש שם מלא, גיל, עיר, פרופילים חברתיים ועוד. תוצג רשימה לאישור לפני עדכון.
            </div>
            <Button onClick={runScan} className="gap-2">
              <Sparkles className="h-4 w-4" /> התחל סריקה
            </Button>
          </div>
        )}

        {loading && (
          <div className="py-10 flex flex-col items-center gap-3">
            <RealtyzLoader size="md" label="סורק את הרשת..." />
          </div>
        )}

        {findings && !loading && (
          <div className="space-y-3 max-h-[420px] overflow-y-auto">
            {summary && (
              <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-md p-2 leading-relaxed">
                {summary}
              </p>
            )}
            {findings.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                לא נמצאו נתונים חדשים ברשת עבור מתעניין זה.
              </p>
            )}
            {findings.map((f) => (
              <label key={f.key} className="flex items-start gap-3 rounded-md border border-slate-200 p-2.5 hover:bg-slate-50 cursor-pointer">
                <Checkbox
                  checked={!!selected[f.key]}
                  onCheckedChange={(v) => setSelected((s) => ({ ...s, [f.key]: !!v }))}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0 text-right">
                  <div className="flex items-center gap-1.5 justify-end">
                    <span className="text-xs font-bold text-slate-900">{f.label}</span>
                    {f.target === 'social' ? iconFor(f.platform) : <User2 className="h-3.5 w-3.5 text-slate-400" />}
                  </div>
                  <div className="text-sm text-slate-800 truncate" dir="auto">{f.value}</div>
                  {f.source && (
                    <div className="mt-0.5">
                      <Badge variant="outline" className="text-[10px]">{f.source}</Badge>
                    </div>
                  )}
                </div>
              </label>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-start">
          {findings && findings.length > 0 && (
            <Button onClick={applyChanges} disabled={applying} className="gap-2">
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              אשר ועדכן פרופיל
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={applying}>ביטול</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
