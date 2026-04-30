import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ExternalLink, Info, Loader2, Plug } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { BrandLogo } from './BrandLogo';

export interface PlatformField {
  key: string;
  label: string;
  type?: 'text' | 'password';
  placeholder?: string;
}

export interface PlatformDef {
  platform: string;
  display_name: string;
  description: string;
  api_url: string;
  fields: PlatformField[];
}

interface ConnectionRow {
  id: string;
  platform: string;
  display_name: string;
  credentials: Record<string, string>;
  is_connected: boolean;
  last_test_status: string | null;
  last_test_message: string | null;
  last_test_at: string | null;
}

interface Props {
  def: PlatformDef;
  connection?: ConnectionRow | null;
  onChange: () => void;
}

export function SocialConnectionCard({ def, connection, onChange }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(
    connection?.credentials ?? Object.fromEntries(def.fields.map((f) => [f.key, '']))
  );
  const isConfigured = !!connection && Object.values(connection.credentials ?? {}).some((v) => !!String(v).trim());
  const status = connection?.is_connected
    ? { label: 'מחובר', className: 'bg-success', description: 'החשבון מחובר ומוכן לשימוש במערכת.' }
    : isConfigured
      ? { label: 'לא מחובר', className: 'bg-destructive', description: 'נשמרו פרטים, אבל בדיקת החיבור האחרונה לא עברה או טרם אומתה.' }
      : { label: 'לא הוגדר', className: 'bg-warning', description: 'עדיין לא הוזנו פרטי API עבור הפלטפורמה הזו.' };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        platform: def.platform,
        display_name: def.display_name,
        credentials: values,
        is_connected: Object.values(values).some((v) => !!v?.trim()),
        created_by: user?.id,
      };
      if (connection) {
        const { error } = await supabase
          .from('social_connections')
          .update(payload)
          .eq('id', connection.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('social_connections').insert(payload);
        if (error) throw error;
      }
      toast.success('פרטי החיבור נשמרו');
      onChange();
      setOpen(false);
    } catch (e: any) {
      toast.error(e.message || 'שמירה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('test-social-connection', {
        body: { platform: def.platform, credentials: values },
      });
      if (error) throw error;
      const ok = (data as any)?.success;
      const msg = (data as any)?.message ?? (ok ? 'החיבור תקין' : 'החיבור נכשל');
      if (connection) {
        await supabase
          .from('social_connections')
          .update({
            last_test_at: new Date().toISOString(),
            last_test_status: ok ? 'success' : 'failed',
            last_test_message: msg,
          })
          .eq('id', connection.id);
      }
      ok ? toast.success(msg) : toast.error(msg);
      onChange();
    } catch (e: any) {
      toast.error(e.message || 'בדיקת חיבור נכשלה');
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <BrandLogo platform={def.platform} size={20} />
              <h3 className="font-semibold truncate">{def.display_name}</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{def.description}</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <a
            href={def.api_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80"
          >
            קבלת פרטי API
            <ExternalLink className="h-3 w-3" />
          </a>
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                <span className={`h-2.5 w-2.5 rounded-full ${status.className}`} />
                {status.label}
                <Info className="h-3 w-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 text-right" dir="rtl">
              <div className="space-y-1.5">
                <p className="text-sm font-semibold">סטטוס: {status.label}</p>
                <p className="text-xs text-muted-foreground">{status.description}</p>
                {connection?.last_test_message && (
                  <p className="text-xs text-muted-foreground">בדיקה אחרונה: {connection.last_test_message}</p>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {connection?.last_test_status && (
          <p className={`text-[11px] ${connection.last_test_status === 'success' ? 'text-success' : 'text-destructive'}`}>
            בדיקה אחרונה: {connection.last_test_message}
          </p>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="w-full mt-3">
              <Plug className="h-3.5 w-3.5" />
              {connection ? 'ערוך פרטי חיבור' : 'חבר עכשיו'}
            </Button>
          </DialogTrigger>
          <DialogContent dir="rtl">
            <DialogHeader>
              <DialogTitle>{def.display_name}</DialogTitle>
            </DialogHeader>
            <a
              href={def.api_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-fit items-center gap-1 text-xs font-medium text-primary hover:text-primary/80"
            >
              פתח מדריך לקבלת פרטי API
              <ExternalLink className="h-3 w-3" />
            </a>
            <div className="space-y-3">
              {def.fields.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label className="text-xs">{f.label}</Label>
                  <Input
                    type={f.type ?? 'text'}
                    value={values[f.key] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                  />
                </div>
              ))}
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleTest} disabled={testing}>
                {testing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                בדוק חיבור
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                שמור
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
