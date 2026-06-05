import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

type Portal = {
  id: 'homely' | 'yad2' | 'madlan';
  label: string;
  description: string;
  link: string;
  fields: { col: string; label: string; type?: 'text' | 'password'; dir?: 'ltr' | 'rtl' }[];
};

const PORTALS: Portal[] = [
  {
    id: 'homely',
    label: 'Homely',
    description: 'דחיפת לידים אוטומטית ל-Homely OpenCard',
    link: 'https://www.homely.co.il/',
    fields: [
      { col: 'homely_client_code', label: 'Client Code' },
      { col: 'homely_api_key', label: 'API Key', type: 'password' },
    ],
  },
  {
    id: 'yad2',
    label: 'יד2',
    description: 'סנכרון נכסים ולידים מ-yad2.co.il',
    link: 'https://www.yad2.co.il/',
    fields: [
      { col: 'yad2_username', label: 'שם משתמש / Email', dir: 'ltr' },
      { col: 'yad2_api_key', label: 'API Key / Token', type: 'password' },
    ],
  },
  {
    id: 'madlan',
    label: 'מדלן',
    description: 'סנכרון נכסים ולידים מ-madlan.co.il',
    link: 'https://www.madlan.co.il/',
    fields: [
      { col: 'madlan_username', label: 'שם משתמש / Email', dir: 'ltr' },
      { col: 'madlan_api_key', label: 'API Key / Token', type: 'password' },
    ],
  },
];

export function ListingPortalsCard() {
  const { user } = useAuth();
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data } = await supabase
        .from('user_api_keys')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) {
        const v: Record<string, string> = {};
        PORTALS.forEach((p) => p.fields.forEach((f) => { v[f.col] = (data as any)[f.col] ?? ''; }));
        setValues(v);
      }
      setLoading(false);
    })();
  }, [user?.id]);

  const savePortal = async (p: Portal) => {
    if (!user?.id) return;
    setSaving(p.id);
    try {
      const patch: Record<string, any> = { user_id: user.id, updated_at: new Date().toISOString() };
      p.fields.forEach((f) => { patch[f.col] = (values[f.col] ?? '').trim() || null; });
      const { error } = await supabase
        .from('user_api_keys')
        .upsert(patch, { onConflict: 'user_id' });
      if (error) throw error;
      toast.success(`חיבור ${p.label} נשמר`);
    } catch (e: any) {
      toast.error(e?.message ?? 'שמירה נכשלה');
    } finally {
      setSaving(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-right">
          <Link2 className="h-4 w-4 text-primary" />
          חיבורים לפורטלי נדל"ן
        </CardTitle>
        <CardDescription className="text-right">
          חברו את החשבונות שלכם ב-Homely, יד2 ומדלן כדי לסנכרן נכסים ולידים אוטומטית.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : PORTALS.map((p) => {
          const configured = p.fields.every((f) => (values[f.col] ?? '').trim().length > 0);
          return (
            <div key={p.id} className="rounded-lg border bg-card/40 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-right">
                  <div className="flex items-center gap-2 justify-end">
                    {configured && <Badge variant="outline" className="text-emerald-700 border-emerald-300">מחובר</Badge>}
                    <span className="font-semibold">{p.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
                </div>
                <a href={p.link} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                  פתח אתר
                </a>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {p.fields.map((f) => (
                  <div key={f.col} className="space-y-1.5">
                    <Label htmlFor={f.col} className="text-xs">{f.label}</Label>
                    <Input
                      id={f.col}
                      type={f.type ?? 'text'}
                      dir={f.dir ?? 'ltr'}
                      value={values[f.col] ?? ''}
                      onChange={(e) => setValues((s) => ({ ...s, [f.col]: e.target.value }))}
                      placeholder={f.label}
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-start">
                <Button size="sm" onClick={() => savePortal(p)} disabled={saving === p.id} className="gap-2">
                  {saving === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  שמירת {p.label}
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
