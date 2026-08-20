import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Users, Send, Loader2, CheckCircle2, XCircle, Search } from 'lucide-react';

type Group = {
  group_id: string;
  group_name: string;
  group_icon: string | null;
  member_count: number | null;
  is_administrator: boolean | null;
  group_url: string | null;
};

type Result = { ok: boolean; reason?: string };

/**
 * FacebookGroupBulkPostCard — write one property post (text + image + link)
 * and broadcast it to every selected imported Facebook group through the
 * official Graph API (fb-group-publish edge function).
 */
export const FacebookGroupBulkPostCard = () => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [link, setLink] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<Record<string, Result>>({});

  const { data: groups, isLoading } = useQuery({
    queryKey: ['custom-user-groups', 'facebook'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('custom_user_groups')
        .select('id, group_name, group_url')
        .eq('platform', 'facebook')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        group_id: String(r.id),
        group_name: String(r.group_name || r.group_url || 'קבוצה'),
        group_icon: null,
        member_count: null,
        is_administrator: null,
        group_url: r.group_url ?? null,
      })) as Group[];
    },
  });


  const filtered = useMemo(() => {
    const q = query.trim();
    const list = groups ?? [];
    return q ? list.filter((g) => (g.group_name ?? '').includes(q)) : list;
  }, [groups, query]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const publish = async () => {
    if (!message.trim()) {
      toast.error('יש לכתוב תוכן לפוסט');
      return;
    }
    if (selected.size === 0) {
      toast.error('יש לבחור לפחות קבוצה אחת');
      return;
    }
    setSending(true);
    setResults({});
    let ok = 0;
    let failed = 0;
    for (const groupId of Array.from(selected)) {
      try {
        const { data, error } = await supabase.functions.invoke('fb-group-publish', {
          body: {
            group_id: groupId,
            message: message.trim(),
            link: link.trim() || undefined,
            image_url: imageUrl.trim() || undefined,
          },
        });
        if (error) throw error;
        const res: any = data;
        if (res?.ok) {
          ok++;
          setResults((p) => ({ ...p, [groupId]: { ok: true } }));
        } else {
          failed++;
          setResults((p) => ({ ...p, [groupId]: { ok: false, reason: res?.reason } }));
        }
      } catch (e: any) {
        failed++;
        setResults((p) => ({ ...p, [groupId]: { ok: false, reason: e?.message } }));
      }
    }
    setSending(false);
    if (ok > 0) toast.success(`הפוסט פורסם ב-${ok} קבוצות`, { description: failed ? `${failed} נכשלו` : undefined });
    else toast.error('הפרסום נכשל בכל הקבוצות הנבחרות');
  };

  return (
    <Card className="border-blue-200" dir="rtl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4 text-blue-600" />
          פרסום מרוכז לקבוצות פייסבוק
        </CardTitle>
        <CardDescription className="text-xs">
          כתיבת פוסט אחד (טקסט, תמונה וקישור לנכס) ושליחתו בו-זמנית לכל הקבוצות שנבחרו
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="text-xs">תוכן הפוסט</Label>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            placeholder="דירת 4 חדרים מרווחת בהרצליה..."
            className="text-sm"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs">קישור לנכס (אופציונלי)</Label>
            <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://realtyz.co.il/..." className="text-sm" dir="ltr" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">כתובת תמונה (אופציונלי)</Label>
            <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." className="text-sm" dir="ltr" />
          </div>
        </div>
        {link.trim() && imageUrl.trim() && (
          <p className="text-[11px] text-amber-700">
            כשקיים קישור, פייסבוק מציג את תצוגת הקישור ולא את התמונה שהועלתה.
          </p>
        )}

        <Separator />

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="חיפוש קבוצה"
              className="h-8 pr-7 text-xs"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => setSelected(new Set(filtered.map((g) => g.group_id)))}>
            בחר הכל
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            נקה
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> טוען קבוצות...
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            לא נמצאו קבוצות מיובאות. יש לחבר פרופיל פייסבוק אישי ולייבא קבוצות.
          </p>
        ) : (
          <div className="max-h-64 overflow-y-auto space-y-1.5">
            {filtered.map((g) => {
              const res = results[g.group_id];
              return (
                <label
                  key={g.group_id}
                  className="flex items-center gap-2 rounded-lg border border-blue-100 bg-white/70 px-2.5 py-1.5 cursor-pointer"
                >
                  <Checkbox checked={selected.has(g.group_id)} onCheckedChange={() => toggle(g.group_id)} />
                  {g.group_icon ? (
                    <img src={g.group_icon} alt="" className="h-6 w-6 rounded" />
                  ) : (
                    <Users className="h-4 w-4 text-blue-500" />
                  )}
                  <span className="text-xs flex-1 truncate">{g.group_name}</span>
                  {g.is_administrator && (
                    <Badge variant="outline" className="text-[9px] border-blue-300 text-blue-700">מנהל/ת</Badge>
                  )}
                  {g.member_count != null && (
                    <span className="text-[10px] text-muted-foreground">{g.member_count.toLocaleString('he-IL')}</span>
                  )}
                  {res?.ok && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                  {res && !res.ok && <XCircle className="h-4 w-4 text-red-500" />}
                </label>
              );
            })}
          </div>
        )}

        {Object.values(results).some((r) => !r.ok) && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 space-y-1">
            {Object.entries(results)
              .filter(([, r]) => !r.ok)
              .map(([id, r]) => (
                <p key={id} className="text-[11px] text-red-700">
                  {groups?.find((g) => g.group_id === id)?.group_name ?? id}: {r.reason ?? 'פרסום נכשל'}
                </p>
              ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-muted-foreground">{selected.size} קבוצות נבחרו</span>
          <Button size="sm" onClick={publish} disabled={sending} className="gap-1">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            פרסום לקבוצות
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default FacebookGroupBulkPostCard;
