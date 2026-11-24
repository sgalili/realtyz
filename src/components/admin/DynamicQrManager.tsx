import { useEffect, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, ExternalLink, Loader2, Plus, QrCode, Save, ScanLine } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { dynamicQrPublicUrl, normalizeDynamicQrDestination } from '@/lib/dynamicQr';
import qrLogo from '@/assets/toraff-qr-logo.png';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function DynamicQrManager() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [draft, setDraft] = useState('');
  const [selectedId, setSelectedId] = useState('original');
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);
  const [logoReady, setLogoReady] = useState(false);
  const { data: codes, isLoading, error } = useQuery({
    queryKey: ['dynamic-qr-codes', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [original, custom] = await Promise.all([
        supabase.from('dynamic_qr_config').select('qr_destination_url, total_scans, last_scanned_at, updated_at').eq('id', 1).single(),
        supabase.from('dynamic_qr_codes').select('id, name, qr_destination_url, total_scans, last_scanned_at, updated_at').order('updated_at', { ascending: false }),
      ]);
      if (original.error) throw original.error;
      if (custom.error) throw custom.error;
      return [{ ...original.data, id: 'original', name: 'QR ראשי' }, ...custom.data];
    },
    refetchInterval: 30_000,
  });
  const data = codes?.find((code) => code.id === selectedId);
  const isNew = selectedId === 'new';
  const QR_URL = dynamicQrPublicUrl(selectedId === 'original' || isNew ? undefined : selectedId);

  useEffect(() => {
    setDraft(data?.qr_destination_url ?? '');
    setName(data?.name ?? '');
  }, [selectedId, data?.qr_destination_url, data?.name]);

  useEffect(() => {
    const image = new Image();
    image.onload = () => setLogoReady(true);
    image.onerror = () => setLogoReady(false);
    image.src = qrLogo;
  }, []);

  const [saving, setSaving] = useState(false);

  const saveDestination = async () => {
    if (saving || !user) return;
    setSaving(true);
    setSaved(false);
    try {
      const destination = normalizeDynamicQrDestination(draft);
      const payload = { qr_destination_url: destination, updated_at: new Date().toISOString(), updated_by: user.id };
      const codeName = name.trim();
      if (selectedId !== 'original' && (!codeName || codeName.length > 120)) throw new Error('יש להזין שם של עד 120 תווים');
      const result = selectedId === 'original'
        ? await supabase.from('dynamic_qr_config').update(payload).eq('id', 1).select().single()
        : isNew
          ? await supabase.from('dynamic_qr_codes').insert({ ...payload, name: codeName }).select().single()
          : await supabase.from('dynamic_qr_codes').update({ ...payload, name: codeName }).eq('id', selectedId).select().single();
      const { data: updated, error: saveError } = result;
      if (saveError) throw saveError;
      if (!updated) throw new Error('שמירת ה-QR נכשלה');
      await queryClient.invalidateQueries({ queryKey: ['dynamic-qr-codes', user.id] });
      if (isNew) setSelectedId(String(updated.id));
      setDraft(updated.qr_destination_url);
      setSaved(true);
      toast.success('יעד ה-QR עודכן וההפניה כבר פעילה');
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'שמירת יעד ה-QR נכשלה');
    } finally {
      setSaving(false);
    }
  };

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas || !logoReady) return;
    requestAnimationFrame(() => {
      canvas.toBlob((blob) => {
        if (!blob) {
          toast.error('יצירת קובץ ה-QR נכשלה');
          return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `toraff-qr-${selectedId}-1024.png`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast.success('קובץ PNG באיכות גבוהה ירד למכשיר');
      }, 'image/png');
    });
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex min-w-0 items-center gap-2">
        <Select value={selectedId} onValueChange={(id) => { setSelectedId(id); setSaved(false); }} disabled={saving || isLoading}>
          <SelectTrigger className="min-w-0 flex-1" aria-label="בחירת קוד QR"><SelectValue /></SelectTrigger>
          <SelectContent>
            {codes?.map((code) => <SelectItem key={code.id} value={code.id}>{code.name}</SelectItem>)}
            {isNew && <SelectItem value="new">קוד חדש</SelectItem>}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => { setSelectedId('new'); setDraft(''); setName(''); setSaved(false); }} disabled={saving || isLoading}>
          <Plus className="h-4 w-4" /> קוד חדש
        </Button>
      </div>
    <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><QrCode className="h-5 w-5 text-primary" /> ניהול QR דינמי</CardTitle>
          <CardDescription>הקוד המודפס נשאר קבוע. שינוי היעד כאן מתעדכן מיד בכל סריקה חדשה.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {selectedId !== 'original' && <div className="space-y-2">
            <Label htmlFor="dynamic-qr-name">שם הקוד</Label>
            <Input id="dynamic-qr-name" value={name} maxLength={120} onChange={(event) => { setName(event.target.value); setSaved(false); }} disabled={saving} placeholder="שם הקמפיין או המיקום" />
          </div>}
          <div className="space-y-2">
            <Label htmlFor="dynamic-qr-destination">יעד נוכחי</Label>
            <Input
              id="dynamic-qr-destination"
              dir="ltr"
              type="url"
              inputMode="url"
              value={draft}
              onChange={(event) => { setDraft(event.target.value); setSaved(false); }}
              placeholder="https://toraff.co.il/"
              disabled={isLoading || saving}
              className="text-left text-base"
            />
            {data?.qr_destination_url && <a href={data.qr_destination_url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 break-all text-sm text-primary underline-offset-4 hover:underline">
              <ExternalLink className="h-3.5 w-3.5 shrink-0" /> פתיחת היעד הנוכחי
            </a>}
            {error && <p role="alert" className="text-sm text-destructive">טעינת הגדרות ה-QR נכשלה. נסו לרענן את העמוד.</p>}
          </div>
          <Button type="button" onClick={() => void saveDestination()} disabled={isLoading || saving || !draft.trim()} className="w-full sm:w-auto">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isNew ? 'יצירת קוד QR' : 'שמירת יעד חדש'}
          </Button>
          {saved && <p role="status" className="text-sm font-medium text-primary">יעד ה-QR עודכן וההפניה כבר פעילה</p>}
          <div className="grid grid-cols-2 gap-3 border-t border-border pt-4" aria-label="סטטיסטיקת שימוש ב-QR">
            <div>
              <p className="text-sm text-muted-foreground">סה״כ סריקות</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{(data?.total_scans ?? 0).toLocaleString('he-IL')}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">סריקה אחרונה</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{data?.last_scanned_at ? new Date(data.last_scanned_at).toLocaleString('he-IL') : 'עדיין לא נסרק'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {!isNew && <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><ScanLine className="h-5 w-5 text-primary" /> קוד QR ממותג להדפסה</CardTitle>
          <CardDescription>{"\n"}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <div className="w-full max-w-[340px] rounded-lg border border-border bg-card p-3 shadow-xs">
            <QRCodeCanvas
              ref={canvasRef}
              value={QR_URL}
              size={1024}
              level="H"
              marginSize={4}
              bgColor="#FFFFFF"
              fgColor="#000000"
              imageSettings={{ src: qrLogo, width: 230, height: 230, excavate: true }}
              className="block h-auto w-full"
              style={{ width: '100%', height: 'auto' }}
              aria-label={`קוד QR אל ${QR_URL}`}
            />
          </div>
          <code dir="ltr" className="break-all text-center text-sm text-muted-foreground">{QR_URL}</code>
          {!logoReady && <p className="text-sm text-muted-foreground">טוען את לוגו TORAFF…</p>}
          <Button type="button" onClick={download} disabled={!logoReady} className="w-full sm:w-auto">
            <Download className="h-4 w-4" /> הורדת PNG באיכות גבוהה
          </Button>
        </CardContent>
      </Card>}
    </div>
    </div>
  );
}

export default DynamicQrManager;
