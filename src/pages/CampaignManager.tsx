import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Megaphone, Link2, Copy, CheckCircle2, Sparkles, TrendingUp, AlertTriangle, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useDemoGuard } from '@/hooks/useDemoGuard';
import { useAuth } from '@/hooks/useAuth';
import { useDemoMode } from '@/hooks/useDemoMode';
import { getDemoCampaigns, getDemoMetaAdCampaigns, getDemoTrackingLinks } from '@/lib/demoData';
import { useEffect, useMemo } from 'react';
import { useElectionType } from '@/hooks/useElectionType';

const CampaignManager = () => {
  const [targetUrl, setTargetUrl] = useState('');
  const [linkTag, setLinkTag] = useState('');
  const [generatedLink, setGeneratedLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [metaName, setMetaName] = useState('');
  const [metaAudience, setMetaAudience] = useState('supporters');
  const [metaBudget, setMetaBudget] = useState('150');
  const [metaBrief, setMetaBrief] = useState('');
  const queryClient = useQueryClient();
  const blockDemoAction = useDemoGuard();
  const { user } = useAuth();
  const { isDemoMode, demoCandidateId } = useDemoMode();
  const { type: electionType, terms } = useElectionType();
  const isPrimaries = electionType === 'primaries';

  useRealtimeSubscription('campaigns', [['campaigns']]);
  useRealtimeSubscription('tracking_links', [['tracking-links']]);

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: async () => {
      const { data } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false });
      return data ?? [];
    },
  });

  const { data: trackingLinks } = useQuery({
    queryKey: ['tracking-links'],
    queryFn: async () => {
      const { data } = await supabase.from('tracking_links').select('*').order('created_at', { ascending: false }).limit(10);
      return data ?? [];
    },
  });

  const { data: metaCampaigns } = useQuery({
    queryKey: ['meta-ad-campaigns', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from('meta_ad_campaigns').select('*').eq('user_id', user!.id).order('created_at', { ascending: false });
      return data ?? [];
    },
  });


  const displayCampaigns = useMemo(
    () => (isDemoMode ? [...getDemoCampaigns(demoCandidateId), ...(campaigns ?? [])] : (campaigns ?? [])),
    [isDemoMode, demoCandidateId, campaigns],
  );
  const displayTrackingLinks = useMemo(
    () => (isDemoMode ? [...getDemoTrackingLinks(demoCandidateId), ...(trackingLinks ?? [])] : (trackingLinks ?? [])),
    [isDemoMode, demoCandidateId, trackingLinks],
  );
  const displayMetaCampaigns = useMemo(
    () => (isDemoMode ? [...getDemoMetaAdCampaigns(demoCandidateId), ...(metaCampaigns ?? [])] : (metaCampaigns ?? [])),
    [isDemoMode, demoCandidateId, metaCampaigns],
  );

  // Live ticker for demo: gradually grow campaign metrics to simulate a real live campaign
  const [demoTick, setDemoTick] = useState(0);
  useEffect(() => {
    if (!isDemoMode) return;
    const id = setInterval(() => setDemoTick((t) => t + 1), 3000);
    return () => clearInterval(id);
  }, [isDemoMode]);

  const AUDIENCE_LABELS: Record<string, string> = {
    supporters: isPrimaries ? `${terms.voters} מהמפלגה` : terms.supporters,
    swing: isPrimaries ? 'מתפקדים מתלבטים' : 'מתלבטים',
    exclude_opponents: isPrimaries ? `${terms.voters}, ללא מתנגדים` : `${terms.supporters}, ללא מתנגדים`,
  };
  const STATUS_LABELS: Record<string, string> = {
    active: 'פעיל',
    paused: 'מושהה',
    draft: 'טיוטה',
    completed: 'הושלם',
  };

  const liveMetaCampaigns = useMemo(() => {
    if (!isDemoMode) return displayMetaCampaigns;
    return displayMetaCampaigns.map((c: any, idx: number) => {
      const baseSpend = Number(c.metrics?.spend ?? 0);
      const baseEng = Number(c.metrics?.engagements ?? 0);
      const baseCpa = Number(c.metrics?.cpa ?? 0);
      const seed = (idx + 1);
      const spendInc = Math.floor((demoTick * (7 + seed * 3)) + (demoTick % 2 === 0 ? 4 : 11));
      const engInc = Math.floor((demoTick * (23 + seed * 9)) + (demoTick % 3 === 0 ? 17 : 5));
      const cpaJitter = ((Math.sin(demoTick / 2 + seed) + 1) / 2) * 0.6 - 0.3;
      return {
        ...c,
        metrics: {
          ...(c.metrics ?? {}),
          spend: baseSpend + spendInc,
          engagements: baseEng + engInc,
          cpa: Math.max(0.5, +(baseCpa + cpaJitter).toFixed(2)),
        },
      };
    });
  }, [isDemoMode, displayMetaCampaigns, demoTick]);

  const liveCampaigns = useMemo(() => {
    if (!isDemoMode) return displayCampaigns;
    return displayCampaigns.map((c: any, idx: number) => {
      const seed = idx + 1;
      const sentInc = Math.floor(demoTick * (12 + seed * 5));
      const clickInc = Math.floor(demoTick * (3 + seed * 2));
      return {
        ...c,
        total_sent: (c.total_sent ?? 0) + sentInc,
        total_clicks: (c.total_clicks ?? 0) + clickInc,
      };
    });
  }, [isDemoMode, displayCampaigns, demoTick]);


  const generateLink = useMutation({
    mutationFn: async () => {
      if (blockDemoAction('create-tracking-link')) throw new Error('demo-blocked');
      const shortCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const { error } = await supabase.from('tracking_links').insert({
        target_url: targetUrl,
        short_code: shortCode,
        tag: linkTag,
      });
      if (error) throw error;
      return shortCode;
    },
    onSuccess: (shortCode) => {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const link = `https://${projectId}.supabase.co/functions/v1/smart-link/${shortCode}`;
      setGeneratedLink(link);
      queryClient.invalidateQueries({ queryKey: ['tracking-links'] });
      toast.success('קישור מעקב נוצר!');
    },
    onError: (error: Error) => { if (error.message !== 'demo-blocked') toast.error('יצירת הקישור נכשלה'); },
  });

  const createMetaDraft = useMutation({
    mutationFn: async () => {
      if (blockDemoAction('create-meta-ad-campaign')) throw new Error('demo-blocked');
      if (!user?.id) throw new Error('יש להתחבר כדי ליצור קמפיין');
      if (!metaName.trim()) throw new Error('יש להזין שם קמפיין');
      const variants = [1, 2, 3].map((n) => ({
        title: `וריאציה ${n}`,
        primary_text: `${metaBrief || 'מסר קמפיין ממוקד'}. פנייה קצרה, ברורה ומבוססת נתונים לקהל ${AUDIENCE_LABELS[metaAudience] ?? 'מותאם'}.`,
        headline: n === 1 ? 'מקשיבים. פועלים. מנצחים.' : n === 2 ? 'הקול שלך הופך להשפעה' : 'תוכנית מעשית לשינוי אמיתי',
      }));
      const { error } = await supabase.from('meta_ad_campaigns').insert({
        user_id: user.id,
        name: metaName,
        audience_type: metaAudience,
        daily_budget: Number(metaBudget) || 0,
        creative_variants: variants,
        metrics: { spend: 0, engagements: 0, cpa: 0, roas: 0 },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meta-ad-campaigns'] });
      setMetaName(''); setMetaBrief('');
      toast.success('טיוטת Meta Ads נוצרה עם 3 וריאציות AI');
    },
    onError: (error: Error) => { if (error.message !== 'demo-blocked') toast.error(error.message); },
  });

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('הקישור הועתק!');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-xl font-bold tracking-tight text-primary">ניהול קמפיינים</h2>
        <p className="text-sm text-muted-foreground">ניהול קמפיינים וקישורי מעקב</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Megaphone className="h-4 w-4 text-primary" /> ניהול קמפיינים ב-Meta Ads</CardTitle>
              <CardDescription>יצירת קמפיין Facebook/Instagram פשוט עם 3 וריאציות מסר וקהל מסונכרן מה-CRM</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs">שם קמפיין</Label>
                <Input value={metaName} onChange={(e) => setMetaName(e.target.value)} placeholder="קמפיין מתלבטים חיפה" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">קהל יעד</Label>
                <Select value={metaAudience} onValueChange={setMetaAudience}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="supporters">{AUDIENCE_LABELS.supporters} מה-CRM</SelectItem>
                    <SelectItem value="swing">{AUDIENCE_LABELS.swing}</SelectItem>
                    <SelectItem value="exclude_opponents">{AUDIENCE_LABELS.exclude_opponents}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">תקציב יומי ₪</Label>
                <Input value={metaBudget} onChange={(e) => setMetaBudget(e.target.value)} type="number" min="0" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label className="text-xs">בריף אסטרטגי ל-AI</Label>
                <Textarea value={metaBrief} onChange={(e) => setMetaBrief(e.target.value)} placeholder="המסר, האזור, והנושא המרכזי לקמפיין..." />
              </div>
              <Button className="md:col-span-2" onClick={() => createMetaDraft.mutate()} disabled={createMetaDraft.isPending}>
                <Sparkles className="h-4 w-4" /> {createMetaDraft.isPending ? 'יוצר...' : 'צור 3 מודעות AI כטיוטה'}
              </Button>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {liveMetaCampaigns?.map((campaign: any) => {
              const metrics = campaign.metrics as any;
              const variants = campaign.creative_variants as any[];
              const statusLabel = STATUS_LABELS[String(campaign.status)] ?? campaign.status;
              const audienceLabel = AUDIENCE_LABELS[String(campaign.audience_type)] ?? campaign.audience_type;
              return (
                <Card key={campaign.id} className="border-border/50">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-sm">{campaign.name}</CardTitle>
                      <Badge variant="outline">{statusLabel}</Badge>
                    </div>
                    <CardDescription>₪{Number(campaign.daily_budget).toLocaleString()} ליום · {audienceLabel}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-md bg-muted/40 p-2"><p className="text-sm font-bold tabular-nums">₪{Number(metrics?.spend ?? 0).toLocaleString('he-IL')}</p><p className="text-[10px] text-muted-foreground">הוצאה</p></div>
                      <div className="rounded-md bg-muted/40 p-2"><p className="text-sm font-bold tabular-nums">{Number(metrics?.engagements ?? 0).toLocaleString('he-IL')}</p><p className="text-[10px] text-muted-foreground">מעורבות</p></div>
                      <div className="rounded-md bg-muted/40 p-2"><p className="text-sm font-bold tabular-nums">₪{Number(metrics?.cpa ?? 0).toFixed(2)}</p><p className="text-[10px] text-muted-foreground">עלות לפעולה</p></div>
                    </div>
                    <div className="space-y-1">
                      {variants?.slice(0, 3).map((variant, index) => <p key={index} className="text-xs rounded border border-border/40 p-2"><TrendingUp className="inline h-3 w-3 text-primary ml-1" />{variant.headline}</p>)}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <h2 className="text-base font-semibold">קמפיינים פעילים</h2>
          {isLoading && <p className="text-sm text-muted-foreground">טוען...</p>}
          {displayCampaigns?.length === 0 && !isLoading && (
            <Card className="border-border/50">
              <CardContent className="py-8 text-center text-muted-foreground text-sm">אין קמפיינים עדיין</CardContent>
            </Card>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {liveCampaigns?.map((campaign: any) => {
              const clickRate = campaign.total_sent ? Math.round(((campaign.total_clicks ?? 0) / campaign.total_sent) * 100) : 0;
              return (
                <Card key={campaign.id} className="border-border/50 hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-sm">{campaign.name}</CardTitle>
                      {campaign.tag_associated && (
                        <Badge variant="secondary" className="text-[10px]">{campaign.tag_associated}</Badge>
                      )}
                    </div>
                    {campaign.description && (
                      <CardDescription className="text-xs">{campaign.description}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="text-center p-2 rounded-lg bg-muted/50">
                        <p className="text-lg font-bold tabular-nums">{Number(campaign.total_sent ?? 0).toLocaleString('he-IL')}</p>
                        <p className="text-[10px] text-muted-foreground tracking-wider">נשלחו</p>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-muted/50">
                        <p className="text-lg font-bold tabular-nums">{Number(campaign.total_clicks ?? 0).toLocaleString('he-IL')}</p>
                        <p className="text-[10px] text-muted-foreground tracking-wider">לחיצות</p>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>אחוז לחיצות</span>
                        <span className="font-medium">{clickRate}%</span>
                      </div>
                      <Progress value={clickRate} className="h-1.5" />
                    </div>
                    {campaign.sms_body && (
                      <p className="text-xs text-muted-foreground border-r-2 border-primary/30 pr-2 italic line-clamp-2">
                        {campaign.sms_body}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      נוצר {campaign.created_at ? format(new Date(campaign.created_at), 'dd/MM/yyyy') : '-'}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Link2 className="h-4 w-4 text-primary" /> מחולל קישורים חכם
              </CardTitle>
              <CardDescription className="text-xs">יצירת כתובות מעקב ייחודיות לקמפיינים</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs">כתובת יעד</Label>
                <Input
                  placeholder="https://example.com/article"
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  className="text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">תגית</Label>
                <Select value={linkTag} onValueChange={setLinkTag}>
                  <SelectTrigger>
                    <SelectValue placeholder="בחר תגית" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Security">ביטחון</SelectItem>
                    <SelectItem value="Economy">כלכלה</SelectItem>
                    <SelectItem value="Legal">משפטי</SelectItem>
                    <SelectItem value="Social">חברתי</SelectItem>
                    <SelectItem value="General">כללי</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={() => generateLink.mutate()}
                disabled={!targetUrl || !linkTag || generateLink.isPending}
                className="w-full"
                size="sm"
              >
                <Link2 className="h-4 w-4 ml-2" />
                {generateLink.isPending ? 'מייצר...' : 'ייצר קישור מעקב'}
              </Button>

              {generatedLink && (
                <div className="p-3 rounded-lg bg-muted/50 border border-border/50 space-y-2">
                  <p className="text-[10px] text-muted-foreground tracking-wider">קישור שנוצר</p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-background px-2 py-1 rounded flex-1 truncate" dir="ltr">{generatedLink}</code>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleCopy(generatedLink)}>
                      {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">קישורי מעקב אחרונים</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {displayTrackingLinks?.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-3">אין קישורי מעקב עדיין</p>
                )}
                {displayTrackingLinks?.map((link) => (
                  <div key={link.id} className="flex items-center gap-2 p-2 rounded border border-border/30 text-xs">
                    <Badge variant="outline" className="text-[9px] shrink-0">{link.tag}</Badge>
                    <span className="font-mono truncate flex-1" dir="ltr">{link.short_code}</span>
                    <span className="text-muted-foreground shrink-0">{link.click_count} לחיצות</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default CampaignManager;
