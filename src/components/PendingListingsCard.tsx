import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Sparkles, Building2, Check, Trash2, Pencil, Loader2, FileQuestion, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { he } from 'date-fns/locale';

interface PendingListing {
  id: string;
  property_title: string;
  description: string | null;
  asking_price: number | null;
  city: string | null;
  neighborhood: string | null;
  address: string | null;
  rooms: number | null;
  sqm: number | null;
  floor: number | null;
  parking: boolean | null;
  elevator: boolean | null;
  features: any;
  extracted_from_lead_id: string | null;
  extraction_metadata: any;
  created_at: string;
}

const fmtPrice = (n: number | null | undefined) => {
  if (!n || n <= 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace(/\.00$/, '')} מיליון ₪`;
  return `${Math.round(n).toLocaleString('he-IL')} ₪`;
};

export function PendingListingsCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<PendingListing | null>(null);
  const [draft, setDraft] = useState<Partial<PendingListing>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['pending-listings', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('listings')
        .select('id, property_title, description, asking_price, city, neighborhood, address, rooms, sqm, floor, parking, elevator, features, extracted_from_lead_id, extraction_metadata, created_at')
        .eq('user_id', user!.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as PendingListing[];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const confirm = useMutation({
    mutationFn: async (l: PendingListing) => {
      const updates: any = {
        status: 'live',
        is_published: true,
      };
      if (draft && editing?.id === l.id) {
        for (const k of ['property_title','description','address','city','neighborhood'] as const) {
          if (draft[k] !== undefined) updates[k] = draft[k];
        }
        for (const k of ['asking_price','rooms','sqm','floor'] as const) {
          if (draft[k] !== undefined) updates[k] = draft[k];
        }
        for (const k of ['parking','elevator'] as const) {
          if (draft[k] !== undefined) updates[k] = draft[k];
        }
      }
      const { error } = await supabase
        .from('listings')
        .update(updates)
        .eq('id', l.id)
        .eq('user_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('הנכס אושר ועלה ל-CRM');
      setEditing(null);
      setDraft({});
      qc.invalidateQueries({ queryKey: ['pending-listings', user?.id] });
      qc.invalidateQueries({ queryKey: ['kpi-active-listings', user?.id] });
    },
    onError: (e: any) => toast.error(e?.message || 'אישור הנכס נכשל'),
  });

  const discard = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('listings')
        .update({ status: 'discarded', is_published: false })
        .eq('id', id)
        .eq('user_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('הנכס נדחה');
      setEditing(null);
      setDraft({});
      qc.invalidateQueries({ queryKey: ['pending-listings', user?.id] });
    },
    onError: (e: any) => toast.error(e?.message || 'דחיית הנכס נכשלה'),
  });

  const openEdit = (l: PendingListing) => {
    setEditing(l);
    setDraft({});
  };

  return (
    <Card dir="rtl" className="border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              נכסים חדשים שזוהו על ידי ה-AI
            </CardTitle>
            <CardDescription className="text-xs">
              ה-AI חילץ פרטי נכס משיחות עם מתעניינים. אשר/י, ערוך/י או דחה/י לפני שהם נכנסים ל-CRM.
            </CardDescription>
          </div>
          {!isLoading && (data?.length ?? 0) > 0 && (
            <Badge variant="outline" className="border-primary/40 text-primary">{data!.length} ממתינים</Badge>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !data || data.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileQuestion className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">אין נכסים שממתינים לאישור.</p>
            <p className="text-[11px] mt-1">ה-AI יוסיף כאן נכסים חדשים אוטומטית כשיזהה אותם בשיחות.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {data.map((l) => (
              <li
                key={l.id}
                className="flex flex-col gap-2 p-3 rounded-lg border border-border/60 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 min-w-0">
                    <Building2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{l.property_title}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {l.asking_price ? <Badge variant="outline" className="text-[10px]">{fmtPrice(l.asking_price)}</Badge> : null}
                        {l.rooms ? <Badge variant="outline" className="text-[10px]">{l.rooms} חד׳</Badge> : null}
                        {l.sqm ? <Badge variant="outline" className="text-[10px]">{l.sqm} מ"ר</Badge> : null}
                        {l.city ? <Badge variant="outline" className="text-[10px]">{l.city}{l.neighborhood ? ` · ${l.neighborhood}` : ''}</Badge> : null}
                        {l.address ? <Badge variant="outline" className="text-[10px]">{l.address}</Badge> : null}
                        {l.floor !== null ? <Badge variant="outline" className="text-[10px]">קומה {l.floor}</Badge> : null}
                        {l.parking ? <Badge variant="outline" className="text-[10px]">חניה</Badge> : null}
                        {l.elevator ? <Badge variant="outline" className="text-[10px]">מעלית</Badge> : null}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        זוהה {formatDistanceToNow(new Date(l.created_at), { addSuffix: true, locale: he })}
                        {typeof l.extraction_metadata?.confidence === 'number' && (
                          <> · ביטחון: {Math.round(l.extraction_metadata.confidence * 100)}%</>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => openEdit(l)} className="h-8 gap-1">
                      <Pencil className="h-3.5 w-3.5" /> ערוך
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => confirm.mutate(l)}
                      disabled={confirm.isPending}
                      className="h-8 gap-1"
                    >
                      {confirm.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      אשר
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => discard.mutate(l.id)}
                      disabled={discard.isPending}
                      className="h-8 text-destructive hover:text-destructive"
                      aria-label="דחה"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {l.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{l.description}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {/* Edit sheet */}
      <Sheet open={!!editing} onOpenChange={(o) => { if (!o) { setEditing(null); setDraft({}); } }}>
        <SheetContent side="left" dir="rtl" className="overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>עריכת נכס לפני אישור</SheetTitle>
            <SheetDescription className="text-xs">השלם/י או תקן/י את מה שה-AI חילץ. השינויים נשמרים בעת אישור.</SheetDescription>
          </SheetHeader>
          {editing && (
            <div className="space-y-3 mt-4">
              <Field label="כותרת" value={draft.property_title ?? editing.property_title}
                onChange={(v) => setDraft((d) => ({ ...d, property_title: v }))} />
              <div className="grid grid-cols-2 gap-2">
                <NumField label='מחיר (₪)' value={draft.asking_price ?? editing.asking_price ?? 0}
                  onChange={(n) => setDraft((d) => ({ ...d, asking_price: n }))} />
                <NumField label="חדרים" step={0.5} value={draft.rooms ?? editing.rooms ?? 0}
                  onChange={(n) => setDraft((d) => ({ ...d, rooms: n }))} />
                <NumField label='מ"ר' value={draft.sqm ?? editing.sqm ?? 0}
                  onChange={(n) => setDraft((d) => ({ ...d, sqm: n }))} />
                <NumField label="קומה" value={draft.floor ?? editing.floor ?? 0}
                  onChange={(n) => setDraft((d) => ({ ...d, floor: n }))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="עיר" value={draft.city ?? editing.city ?? ''}
                  onChange={(v) => setDraft((d) => ({ ...d, city: v }))} />
                <Field label="שכונה" value={draft.neighborhood ?? editing.neighborhood ?? ''}
                  onChange={(v) => setDraft((d) => ({ ...d, neighborhood: v }))} />
              </div>
              <Field label="כתובת" value={draft.address ?? editing.address ?? ''}
                onChange={(v) => setDraft((d) => ({ ...d, address: v }))} />
              <div className="flex items-center gap-4 pt-1">
                <BoolField label="חניה" value={draft.parking ?? editing.parking}
                  onChange={(b) => setDraft((d) => ({ ...d, parking: b }))} />
                <BoolField label="מעלית" value={draft.elevator ?? editing.elevator}
                  onChange={(b) => setDraft((d) => ({ ...d, elevator: b }))} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold">תיאור</Label>
                <Textarea
                  value={draft.description ?? editing.description ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                  className="min-h-[100px] text-sm"
                  maxLength={4000}
                />
              </div>
            </div>
          )}
          <SheetFooter className="mt-6 gap-2">
            <Button
              variant="outline"
              onClick={() => editing && discard.mutate(editing.id)}
              disabled={discard.isPending}
              className="gap-1"
            >
              <Trash2 className="h-4 w-4" /> דחה
            </Button>
            <Button
              onClick={() => editing && confirm.mutate(editing)}
              disabled={confirm.isPending}
              className="gap-1"
            >
              {confirm.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              שמור ואשר
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </Card>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs font-semibold">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-9 text-sm" />
    </div>
  );
}
function NumField({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (n: number) => void; step?: number }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs font-semibold">{label}</Label>
      <Input
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="h-9 text-sm"
      />
    </div>
  );
}
function BoolField({ label, value, onChange }: { label: string; value: boolean | null; onChange: (b: boolean) => void }) {
  const v = value === true;
  return (
    <button
      type="button"
      onClick={() => onChange(!v)}
      className={`text-xs px-3 py-1.5 rounded border transition ${v ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border hover:bg-muted/50'}`}
    >
      {label}: {v ? 'כן' : 'לא'}
    </button>
  );
}

export default PendingListingsCard;
