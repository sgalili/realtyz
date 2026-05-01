import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import { useWhiteLabel, hexToHslTriplet, pickForegroundForHsl } from '@/hooks/useWhiteLabel';
import { Upload, Trash2, ShieldAlert, Palette, Building2 } from 'lucide-react';

function hslTripletToHex(hsl: string | null | undefined): string {
  if (!hsl) return '#1a2547';
  const m = hsl.match(/(\d+)\s+(\d+)%\s+(\d+)%/);
  if (!m) return '#1a2547';
  const H = Number(m[1]) / 360, S = Number(m[2]) / 100, L = Number(m[3]) / 100;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) => {
    const k = (n + H * 12) % 12;
    const c = L - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export default function WhiteLabelSettings() {
  const { user } = useAuth();
  const { roles, loading: rolesLoading } = useUserRole();
  const { settings, refresh } = useWhiteLabel();
  const { toast } = useToast();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const isManager = roles.some(r => ['managing_broker', 'admin', 'super_admin'].includes(r));

  const [agencyName, setAgencyName] = useState('');
  const [colorHex, setColorHex] = useState('#1a2547');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [hideRealtyz, setHideRealtyz] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (settings) {
      setAgencyName(settings.agency_name ?? '');
      setColorHex(hslTripletToHex(settings.primary_color));
      setLogoUrl(settings.logo_url);
      setHideRealtyz(settings.hide_kalpiz_branding ?? false);
    }
  }, [settings]);

  const handleUpload = async (file: File) => {
    if (!user) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'קובץ לא נתמך', description: 'יש להעלות קובץ תמונה (PNG, JPG, SVG).', variant: 'destructive' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'הקובץ גדול מדי', description: 'גודל מרבי: 2MB.', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const path = `${user.id}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('agency-logos')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('agency-logos').getPublicUrl(path);
      setLogoUrl(data.publicUrl);
      toast({ title: 'הלוגו הועלה', description: 'אל תשכח לשמור את ההגדרות.' });
    } catch (e: any) {
      toast({ title: 'שגיאה בהעלאה', description: e?.message ?? 'לא ניתן להעלות את הקובץ.', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const triplet = hexToHslTriplet(colorHex);
      const fg = triplet ? pickForegroundForHsl(triplet) : null;
      const payload = {
        user_id: user.id,
        agency_name: agencyName.trim() || null,
        logo_url: logoUrl,
        primary_color: triplet,
        primary_foreground_color: fg,
        hide_kalpiz_branding: hideRealtyz,
      };
      const { error } = await supabase
        .from('white_label_settings')
        .upsert(payload, { onConflict: 'user_id' });
      if (error) throw error;
      await refresh();
      toast({ title: 'הגדרות נשמרו', description: 'המיתוג עודכן בכל המערכת.' });
    } catch (e: any) {
      toast({ title: 'שגיאה בשמירה', description: e?.message ?? 'נסה שוב.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await supabase.from('white_label_settings').delete().eq('user_id', user.id);
      setAgencyName(''); setColorHex('#1a2547'); setLogoUrl(null); setHideRealtyz(false);
      await refresh();
      toast({ title: 'המיתוג אופס', description: 'המערכת חזרה לעיצוב ברירת המחדל.' });
    } finally {
      setSaving(false);
    }
  };

  if (rolesLoading) {
    return <div dir="rtl" className="p-6 text-muted-foreground">טוען הרשאות…</div>;
  }

  if (!isManager) {
    return (
      <div dir="rtl" className="p-6 max-w-2xl mx-auto">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>אין הרשאה</AlertTitle>
          <AlertDescription>
            רק מנהל המשרד (Managing Broker) יכול לשנות את מיתוג הסוכנות. פנה למנהל שלך.
          </AlertDescription>
        </Alert>
        <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>חזור</Button>
      </div>
    );
  }

  return (
    <div dir="rtl" className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Building2 className="h-6 w-6 text-primary" />
          מיתוג הסוכנות (White Label)
        </h1>
        <p className="text-sm text-muted-foreground">
          הגדר את שם הסוכנות, הלוגו וצבע הליבה. ההגדרות יחולו על כל הצוות מיד לאחר השמירה.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" /> זהות הסוכנות
          </CardTitle>
          <CardDescription>פרטים בסיסיים שיוצגו בכותרת ובדפי השיתוף.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="agency-name">שם הסוכנות</Label>
            <Input
              id="agency-name"
              value={agencyName}
              onChange={(e) => setAgencyName(e.target.value)}
              placeholder="לדוגמה: רימקס פרימיום הרצליה"
              dir="rtl"
            />
          </div>

          <div className="space-y-2">
            <Label>לוגו הסוכנות</Label>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="h-20 w-20 rounded-md border border-border bg-muted/40 flex items-center justify-center overflow-hidden">
                {logoUrl
                  ? <img src={logoUrl} alt="לוגו" className="max-h-full max-w-full object-contain" />
                  : <span className="text-xs text-muted-foreground">אין לוגו</span>}
              </div>
              <div className="flex flex-col gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(f);
                    e.target.value = '';
                  }}
                />
                <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  <Upload className="h-4 w-4 ms-2" />
                  {uploading ? 'מעלה…' : (logoUrl ? 'החלף לוגו' : 'העלה לוגו')}
                </Button>
                {logoUrl && (
                  <Button variant="ghost" size="sm" onClick={() => setLogoUrl(null)}>
                    <Trash2 className="h-4 w-4 ms-2" /> הסר לוגו
                  </Button>
                )}
                <p className="text-[11px] text-muted-foreground">PNG, JPG, SVG · עד 2MB · רקע שקוף מומלץ.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" /> צבע ליבה
          </CardTitle>
          <CardDescription>הצבע יוחל על כפתורים, כותרות וסרגל הניווט.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={colorHex}
              onChange={(e) => setColorHex(e.target.value)}
              className="h-12 w-16 rounded border border-border cursor-pointer bg-transparent"
              aria-label="בחר צבע ליבה"
            />
            <Input
              value={colorHex}
              onChange={(e) => setColorHex(e.target.value)}
              className="w-32 font-mono"
              dir="ltr"
            />
            <div
              className="h-12 flex-1 rounded-md border border-border flex items-center justify-center text-sm font-semibold"
              style={{
                background: colorHex,
                color: hexToHslTriplet(colorHex)
                  ? `hsl(${pickForegroundForHsl(hexToHslTriplet(colorHex)!)})`
                  : '#fff',
              }}
            >
              תצוגה מקדימה
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">מיתוג Realtyz</CardTitle>
          <CardDescription>בחר אם להציג את שם הפלטפורמה בכותרות הצוות.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
            <div>
              <div className="font-semibold text-sm">הסתר את כיתוב "Realtyz"</div>
              <div className="text-xs text-muted-foreground">
                כאשר מופעל, ה-header יציג רק את שם / לוגו הסוכנות.
              </div>
            </div>
            <Switch checked={hideRealtyz} onCheckedChange={setHideRealtyz} />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2">
        <Button variant="ghost" onClick={handleReset} disabled={saving}>
          <Trash2 className="h-4 w-4 ms-2" /> אפס לברירת מחדל
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'שומר…' : 'שמור הגדרות מיתוג'}
        </Button>
      </div>
    </div>
  );
}
