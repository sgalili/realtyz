import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Users, Send, Sparkles, MessageSquare, Building2, TrendingUp, Lightbulb, Eye } from 'lucide-react';
import { toast } from 'sonner';

type Channel = 'whatsapp' | 'sms';
type UpdateType = 'market_insight' | 'new_listing' | 'opportunity';
type Archetype = 'all' | 'buyers_in_city' | 'renters' | 'investors';

interface PreviewSampleLead {
  id: string;
  full_name: string | null;
  city: string | null;
  neighborhood: string | null;
  deal_type: string | null;
  interest_tag: string | null;
  lead_stage: string | null;
}

interface PreviewResp {
  ok: true;
  recipient_count: number;
  capped_at: number;
  sample: PreviewSampleLead[];
  sample_draft: { lead_name: string | null; message: string } | null;
}

const UPDATE_TYPES: { value: UpdateType; label: string; icon: React.ComponentType<any>; hint: string }[] = [
  { value: 'market_insight', label: 'תובנת שוק', icon: TrendingUp, hint: 'נתון או מגמה רלוונטיים לאזור' },
  { value: 'new_listing',    label: 'נכס חדש',   icon: Building2,  hint: 'הצגה קצרה של נכס שנכנס לשוק' },
  { value: 'opportunity',    label: 'הזדמנות',   icon: Lightbulb,  hint: 'מצב מיוחד שכדאי לפעול בו עכשיו' },
];

const ARCHETYPES: { value: Archetype; label: string; hint: string }[] = [
  { value: 'all',              label: 'כל אנשי הקשר', hint: 'ללא חיתוך אבטיפוס' },
  { value: 'buyers_in_city',   label: 'קונים',          hint: 'pipeline = מכירה' },
  { value: 'renters',          label: 'שוכרים',         hint: 'pipeline = השכרה' },
  { value: 'investors',        label: 'משקיעים',        hint: 'תג "השקעה" או שלב qualified' },
];

export function CommunityBroadcastPanel() {
  const [updateType, setUpdateType] = useState<UpdateType>('market_insight');
  const [channel, setChannel] = useState<Channel>('whatsapp');
  const [draft, setDraft] = useState('');

  const [archetype, setArchetype] = useState<Archetype>('all');
  const [city, setCity] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [interestTag, setInterestTag] = useState('');
  const [leadStage, setLeadStage] = useState<string>('any');
  const [minEngagement, setMinEngagement] = useState<number>(0);
  const [maxRecipients, setMaxRecipients] = useState<number>(100);

  const [preview, setPreview] = useState<PreviewResp | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Live count of leads in DB so the agent has anchor numbers (RLS-scoped).
  const { data: totalLeads } = useQuery({
    queryKey: ['leads-total-rough'],
    queryFn: async () => {
      const { count } = await supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('is_demo', false);
      return count ?? 0;
    },
  });

  const segment = useMemo(() => ({
    archetype,
    city: city.trim() || null,
    neighborhood: neighborhood.trim() || null,
    interest_tag: interestTag.trim() || null,
    lead_stage: leadStage === 'any' ? null : leadStage,
    min_engagement: minEngagement || null,
  }), [archetype, city, neighborhood, interestTag, leadStage, minEngagement]);

  const callBroadcast = async (mode: 'preview' | 'send') => {
    const { data, error } = await supabase.functions.invoke('community-broadcast', {
      body: {
        mode,
        channel,
        update_type: updateType,
        draft: draft.trim(),
        segment,
        max_recipients: Math.max(1, Math.min(200, Number(maxRecipients) || 100)),
      },
    });
    if (error) throw error;
    if ((data as any)?.error) throw new Error((data as any).error);
    return data;
  };

  const onPreview = async () => {
    if (!draft.trim()) { toast.error('יש לכתוב טיוטה'); return; }
    setIsPreviewing(true);
    setPreview(null);
    try {
      const data = await callBroadcast('preview') as PreviewResp;
      setPreview(data);
      if (data.recipient_count === 0) toast.message('הסגמנט לא מצא אנשי קשר מתאימים');
    } catch (e: any) {
      toast.error(e?.message || 'התצוגה המקדימה נכשלה');
    } finally {
      setIsPreviewing(false);
    }
  };

  const onSend = async () => {
    setConfirmOpen(false);
    setIsSending(true);
    try {
      const data: any = await callBroadcast('send');
      toast.success(`נוצרו ${data.queued} טיוטות אישיות. השליחה מתבצעת ברקע.`);
      setPreview(null);
    } catch (e: any) {
      toast.error(e?.message || 'השליחה נכשלה');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div dir="rtl" className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-primary">Community Broadcast · עדכון לקהילה</h2>
        <p className="text-sm text-muted-foreground mt-1">
          בחר/י סגמנט, נסח/י עדכון אחד מקצועי, וה-AI יכתוב הודעה אישית לכל איש קשר בסגנון שלך. אין שליחות גנריות.
        </p>
        {typeof totalLeads === 'number' && (
          <p className="text-[11px] text-muted-foreground mt-1">סה"כ אנשי קשר פעילים במערכת: {totalLeads}</p>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Composer */}
        <Card className="border-primary/20">
          <CardHeader className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="h-4 w-4 text-primary" />
              קומפוזר העדכון
            </CardTitle>
            <CardDescription className="text-xs">בחר/י סוג עדכון, ערוץ, וכתוב/י את ליבת המסר.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold">סוג עדכון</Label>
              <div className="grid grid-cols-3 gap-2">
                {UPDATE_TYPES.map((u) => {
                  const Icon = u.icon;
                  const active = updateType === u.value;
                  return (
                    <button
                      key={u.value}
                      type="button"
                      onClick={() => setUpdateType(u.value)}
                      className={`rounded-md border p-2 text-right transition ${
                        active ? 'border-primary bg-primary/10' : 'border-border bg-background hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <Icon className={`h-3.5 w-3.5 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
                        <span className="text-xs font-medium">{u.label}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1 leading-tight">{u.hint}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold">ערוץ</Label>
                <Select value={channel} onValueChange={(v) => setChannel(v as Channel)}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold">תקרת נמענים</Label>
                <Input
                  type="number" min={1} max={200}
                  value={maxRecipients}
                  onChange={(e) => setMaxRecipients(Number(e.target.value) || 0)}
                  className="h-10"
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold">טיוטת העדכון (כתיבה אנושית, ה-AI יתאים אישית לכל אחד)</Label>
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder='לדוגמה: "מחירי הדירות ברמת השרון ירדו ב-3% ברבעון האחרון. אם שקלת/ה למכור או להחליף נכס, כדאי לעדכן הערכה."'
                className="min-h-[140px] text-sm"
                maxLength={4000}
              />
              <p className="text-[10px] text-muted-foreground text-left">{draft.length}/4000</p>
            </div>
          </CardContent>
        </Card>

        {/* Segmentation */}
        <Card className="border-primary/20">
          <CardHeader className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-primary" />
              סגמנטציה
            </CardTitle>
            <CardDescription className="text-xs">חיתוך לפי אבטיפוס, אזור, סוג עסקה, שלב וטמפרטורה.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold">אבטיפוס</Label>
              <div className="grid grid-cols-2 gap-2">
                {ARCHETYPES.map((a) => {
                  const active = archetype === a.value;
                  return (
                    <button
                      key={a.value}
                      type="button"
                      onClick={() => setArchetype(a.value)}
                      className={`rounded-md border p-2 text-right transition ${
                        active ? 'border-primary bg-primary/10' : 'border-border bg-background hover:bg-muted/50'
                      }`}
                    >
                      <span className="text-xs font-medium">{a.label}</span>
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{a.hint}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold">עיר (ילכד דמיון חלקי)</Label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="הרצליה" className="h-10" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold">שכונה</Label>
                <Input value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} placeholder="מרכז" className="h-10" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold">תג עניין</Label>
                <Input value={interestTag} onChange={(e) => setInterestTag(e.target.value)} placeholder='למשל "השקעה" / "גינה"' className="h-10" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold">שלב</Label>
                <Select value={leadStage} onValueChange={setLeadStage}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">כל השלבים</SelectItem>
                    <SelectItem value="new">חדש</SelectItem>
                    <SelectItem value="qualified">מוסמך</SelectItem>
                    <SelectItem value="negotiation">משא ומתן</SelectItem>
                    <SelectItem value="followup">מעקב</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold">ציון מעורבות מינימלי ({minEngagement})</Label>
              <input
                type="range" min={0} max={100} step={5}
                value={minEngagement}
                onChange={(e) => setMinEngagement(Number(e.target.value))}
                className="w-full"
              />
            </div>

            <div className="flex flex-wrap gap-1.5 pt-1">
              <Badge variant="outline">סוג: {UPDATE_TYPES.find((u) => u.value === updateType)?.label}</Badge>
              <Badge variant="outline">ערוץ: {channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}</Badge>
              <Badge variant="outline">אבטיפוס: {ARCHETYPES.find((a) => a.value === archetype)?.label}</Badge>
              {city && <Badge variant="outline">עיר: {city}</Badge>}
              {neighborhood && <Badge variant="outline">שכונה: {neighborhood}</Badge>}
              {interestTag && <Badge variant="outline">תג: {interestTag}</Badge>}
              {leadStage !== 'any' && <Badge variant="outline">שלב: {leadStage}</Badge>}
              {minEngagement > 0 && <Badge variant="outline">מעורבות≥{minEngagement}</Badge>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="outline"
          onClick={onPreview}
          disabled={isPreviewing || isSending || !draft.trim()}
          className="gap-1.5"
        >
          {isPreviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
          תצוגה מקדימה ודגימה
        </Button>
        <Button
          onClick={() => setConfirmOpen(true)}
          disabled={isSending || !preview || preview.recipient_count === 0}
          className="gap-1.5"
        >
          {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          שיגור אישי לכל איש קשר
        </Button>
      </div>

      {/* Preview output */}
      {preview && (
        <Card className="border-primary/30">
          <CardHeader className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              תוצאת התצוגה המקדימה
            </CardTitle>
            <CardDescription className="text-xs">
              {preview.recipient_count} אנשי קשר תואמים את הסגמנט (תקרה: {preview.capped_at}).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {preview.sample_draft && (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                <Badge variant="outline" className="mb-2 border-primary/40 text-primary">
                  טיוטה לדוגמה ל{preview.sample_draft.lead_name ?? 'איש קשר'}
                </Badge>
                <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-foreground">
                  {preview.sample_draft.message}
                </pre>
              </div>
            )}

            {preview.sample.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">דגימת נמענים:</p>
                <ul className="space-y-1">
                  {preview.sample.map((l) => (
                    <li key={l.id} className="text-[12px] flex flex-wrap gap-x-2 border-b border-border/40 py-1">
                      <span className="font-medium">{l.full_name ?? '(ללא שם)'}</span>
                      {l.city && <span className="text-muted-foreground">· {l.city}{l.neighborhood ? ` / ${l.neighborhood}` : ''}</span>}
                      {l.deal_type && <span className="text-muted-foreground">· {l.deal_type === 'sale' ? 'מכירה' : 'השכרה'}</span>}
                      {l.lead_stage && <span className="text-muted-foreground">· {l.lead_stage}</span>}
                      {l.interest_tag && <span className="text-muted-foreground">· {l.interest_tag}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>אישור שיגור</AlertDialogTitle>
            <AlertDialogDescription>
              ה-AI יכתוב הודעה אישית לכל אחד מ-{preview?.recipient_count ?? 0} אנשי הקשר בסגמנט ויכניס אותן לתור השיגור של {channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}. האם להמשיך?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={onSend}>שיגור</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default CommunityBroadcastPanel;
