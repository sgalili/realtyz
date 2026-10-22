import { useEffect, useState } from 'react';
import { ClipboardList, ListChecks, Phone, Plus, TrendingUp } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import LeadFormFieldsDialog from '@/components/affiliate/LeadFormFieldsDialog';
import { formatPrice } from '@/pages/PublicListingPage';
import type { LeadFormField } from '@/lib/leadTiers';
import { LEAD_PRICE_RANGES, clampLeadPrice, DAILY_UNLIMITED } from '@/lib/leadPriceRanges';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ClosingFeeSlider } from './ClosingFeeSlider';
import { activeLeadLimits, closingFeeAmount, clampClosingPercent, type LeadDailyLimits } from '@/lib/closingFee';
import { WhatsAppIcon } from '@/components/properties/WhatsAppIcon';
import LeadQuestionsDialog from '@/components/affiliate/LeadQuestionsDialog';
import { defaultQuestions, deriveContactOptions, leadCost } from '@/lib/leadTiers';
import { useSetAffiliateReward, type BrokerAffiliateListing, type RewardType } from '@/hooks/useAffiliate';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';

export function RewardDialog({
  listing,
  open,
  onOpenChange,
}: {
  listing: BrokerAffiliateListing | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const save = useSetAffiliateReward();
  const { user } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const draftKey = `affiliate-settings-draft:${user?.id ?? ''}:${activeWorkspaceId ?? ''}:${listing?.id ?? ''}`;
  const zeroToEmpty = (v: unknown) => (v == null || Number(v) === 0 ? "" : String(v));
  const [enabled, setEnabled] = useState(false);
  const [rewardType, setRewardType] = useState<RewardType>("fixed");
  const [amount, setAmount] = useState("");
  const [tier1, setTier1] = useState("");
  const [tier2, setTier2] = useState("");
  const [tier3, setTier3] = useState("");
  const [tier4Type, setTier4Type] = useState<RewardType>("fixed");
  const [tier4, setTier4] = useState("");
  const [dailyCaps, setDailyCaps] = useState<Record<string, string>>({});
  const [questions, setQuestions] = useState<string[]>([]);
  const [questionsPhone, setQuestionsPhone] = useState<string[]>([]);
  const [editingQuestions, setEditingQuestions] = useState<null | "chat" | "phone">(null);
  const [formFields, setFormFields] = useState<LeadFormField[]>([]);
  const [formFieldsOpen, setFormFieldsOpen] = useState(false);
  const [recommendation, setRecommendation] = useState<{
    tier1_median?: number;
    tier2_median?: number;
    sample_size?: number;
  } | null>(null);
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);

  // Sync form state to the listing being edited (render-time, no effect needed).
  if (listing && hydratedFor !== draftKey) {
    setHydratedFor(draftKey);
    setEnabled(listing.affiliate_enabled);
    setRewardType(listing.affiliate_reward_type ?? "fixed");
    setAmount(zeroToEmpty(listing.affiliate_reward_amount));
    setTier1(zeroToEmpty(listing.affiliate_tier1_amount));
    setTier2(zeroToEmpty(listing.affiliate_tier2_amount));
    setTier3(zeroToEmpty(listing.affiliate_tier3_amount));
    setTier4Type((listing.affiliate_tier4_type ?? "fixed") as RewardType);
    setTier4(zeroToEmpty(listing.affiliate_tier4_amount));
    const limits = listing.contact_options?.lead_daily_limits ?? {};
    setDailyCaps(Object.fromEntries(Object.entries(limits).map(([key, value]) => [key, zeroToEmpty(value)])));
    const options =
      listing.contact_options && typeof listing.contact_options === "object" ? listing.contact_options : {};
    const base =
      Array.isArray(options.questions)
        ? options.questions
        : defaultQuestions(listing.deal_type);
    setQuestions(base);
    setFormFields(Array.isArray((options as { form_fields?: LeadFormField[] }).form_fields) ? (options as { form_fields: LeadFormField[] }).form_fields : []);
    setQuestionsPhone(
      Array.isArray(options.questions_phone) ? options.questions_phone : base,
    );
    // Restore any unsaved draft (typed before refresh / closing the dialog).
    try {
      const raw = localStorage.getItem(draftKey);
      const d = raw ? JSON.parse(raw) : null;
      if (d && typeof d === "object") {
        if (typeof d.enabled === "boolean") setEnabled(d.enabled);
        if (d.rewardType) setRewardType(d.rewardType);
        if (typeof d.amount === "string") setAmount(d.amount);
        if (typeof d.tier1 === "string") setTier1(d.tier1);
        if (typeof d.tier2 === "string") setTier2(d.tier2);
        if (typeof d.tier3 === "string") setTier3(d.tier3);
        if (d.tier4Type) setTier4Type(d.tier4Type);
        if (typeof d.tier4 === "string") setTier4(d.tier4);
        if (d.dailyCaps && typeof d.dailyCaps === "object") setDailyCaps(d.dailyCaps);
        if (Array.isArray(d.questions)) setQuestions(d.questions);
        if (Array.isArray(d.questionsPhone)) setQuestionsPhone(d.questionsPhone);
      }
    } catch { /* ignore corrupt draft */ }
    void supabase
      .rpc("get_lead_price_recommendation", {
        _city: listing.city || undefined,
        _deal_type: listing.deal_type === "rent" ? "rent" : "sale",
      })
      .then(({ data }) => setRecommendation((Array.isArray(data) ? data[0] : data) as typeof recommendation));
  }

  // Persist every keystroke/selection so refresh or reopening never wipes inputs.
  useEffect(() => {
    if (!listing || hydratedFor !== draftKey || !user || !activeWorkspaceId) return;
    try {
      localStorage.setItem(
        draftKey,
        JSON.stringify({ enabled, rewardType, amount, tier1, tier2, tier3, tier4Type, tier4, dailyCaps, questions, questionsPhone }),
      );
    } catch { /* storage full / disabled */ }
  }, [listing, hydratedFor, draftKey, user, activeWorkspaceId, enabled, rewardType, amount, tier1, tier2, tier3, tier4Type, tier4, dailyCaps, questions, questionsPhone]);

  const num = (v: string) => Number(v) || 0;
  const clean = (v: string) => v.replace(/[^\d.]/g, "");

  if (!listing) return null;

  const tiers = [
    {
      key: "tier1", capKey: "form",
      title: "מילוי טופס",
      hint: "השארת שם מלא + טלפון בעמוד הנכס.",
      Icon: ClipboardList,
      value: tier1,
      setValue: setTier1,
      cost: leadCost(num(tier1), []),
      questionsKey: null as null | "chat" | "phone",
    },
    {
      key: "tier2", capKey: "whatsapp",
      title: "סינון בווטסאפ",
      hint: "ריטה פותחת ווטסאפ ושואלת את שאלות הסינון",
      Icon: WhatsAppIcon,
      value: tier2,
      setValue: setTier2,
      cost: leadCost(num(tier2), questions),
      questionsKey: "chat" as const,
    },
    {
      key: "tier3", capKey: "phone",
      title: "סינון בשיחת טלפון",
      hint: "אימות פרטי המתעניין בשיחה טלפונית (נציג או AI) ומענה לשאלות הסינון",
      Icon: Phone,
      value: tier3,
      setValue: setTier3,
      cost: leadCost(num(tier3), questionsPhone),
      questionsKey: "phone" as const,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-2xl max-h-[85dvh] overflow-y-auto pb-0">
        <DialogHeader>
          <DialogTitle className="text-right">תמחור לידים</DialogTitle>
          <div className="text-right text-sm"><p className="font-semibold [overflow-wrap:anywhere]">{[[listing.address, listing.house_number].filter(Boolean).join(" "), listing.city].filter(Boolean).join(", ") || listing.property_title || "נכס"}</p>{Number(listing.asking_price) > 0 && <p className="font-bold text-primary">{formatPrice(Number(listing.asking_price), listing.deal_type === "rent" ? "rent" : "sale")}</p>}</div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <div className="text-sm font-semibold text-foreground">פתוח לשיווק ע״י שותפים</div>
              <div className="text-[11px] text-muted-foreground"></div>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {enabled ? (
            <>
              {recommendation && Number(recommendation.sample_size || 0) > 0 ? (
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="mb-2 flex items-center gap-2 font-semibold">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    המלצת מחיר לפי מפרסמים דומים
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-muted-foreground">שדות בטופס דף נחיתה</div>
                      <div className="h-2 rounded-full bg-muted">
                        <div className="h-2 w-2/3 rounded-full bg-warning" />
                      </div>
                      <bdi dir="ltr">₪{Number(recommendation.tier1_median || 0).toLocaleString("he-IL")}</bdi>
                    </div>
                    <div>
                      <div className="text-muted-foreground">ליד מסונן</div>
                      <div className="h-2 rounded-full bg-muted">
                        <div className="h-2 w-3/4 rounded-full bg-primary" />
                      </div>
                      <bdi dir="ltr">₪{Number(recommendation.tier2_median || 0).toLocaleString("he-IL")}</bdi>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    מבוסס על {recommendation.sample_size} נכסים דומים
                  </div>
                </div>
              ) : null}

              <div className="space-y-3">
                <div className="text-sm font-semibold text-foreground">{"\n"}</div>
                <p className="text-[11px] text-muted-foreground"></p>

                {tiers.map((tier) => (
                  <div key={tier.key} className="space-y-1.5 rounded-md border border-border p-2.5">
                    <div className="flex items-center gap-2">
                      <tier.Icon className={`h-4 w-4 ${num(tier.value) > 0 ? "text-primary" : "text-muted-foreground"}`} />
                      <div className="text-[12px] font-semibold text-foreground">{tier.title}</div>
                      {tier.questionsKey ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="ms-auto h-8 w-8"
                          title="עריכת שאלות הסינון"
                          aria-label="עריכת שאלות הסינון"
                          onClick={() => setEditingQuestions(tier.questionsKey)}
                        >
                          <ListChecks className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                    <Label className="text-[11px] font-normal text-muted-foreground">{tier.hint}</Label>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">{num(tier.value) > 0 ? 'פעיל' : 'כבוי'}</span>
                      <Switch aria-label={`הפעלת ${tier.title}`} checked={num(tier.value) > 0} onCheckedChange={(on) => tier.setValue(on ? String(LEAD_PRICE_RANGES[tier.capKey].min) : "")} />
                    </div>
                    {num(tier.value) > 0 && <>
                      <div className="text-center"><bdi dir="ltr" className="text-2xl font-bold text-primary">₪{num(tier.value).toLocaleString("he-IL")}</bdi></div>
                      <div dir="ltr" className="space-y-1 px-2">
                        <Slider dir="ltr" aria-label={`עמלה עבור ${tier.title}`} min={LEAD_PRICE_RANGES[tier.capKey].min} max={LEAD_PRICE_RANGES[tier.capKey].max} step={5} value={[clampLeadPrice(tier.capKey, num(tier.value))]} onValueChange={(v) => v[0] !== undefined && tier.setValue(String(v[0]))} className="closing-slider h-6" />
                        <div className="flex justify-between text-xs tabular-nums text-muted-foreground"><span>₪{LEAD_PRICE_RANGES[tier.capKey].min}</span><span>₪{LEAD_PRICE_RANGES[tier.capKey].max}</span></div>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">מקס׳ לידים ב־24 שעות</span><strong>{num(dailyCaps[tier.capKey] ?? "") > 0 ? num(dailyCaps[tier.capKey] ?? "") : "ללא הגבלה"}</strong></div>
                        <div dir="ltr" className="px-2"><Slider dir="ltr" aria-label={`מגבלה יומית עבור ${tier.title}`} min={1} max={DAILY_UNLIMITED} step={1} value={[num(dailyCaps[tier.capKey] ?? "") > 0 ? Math.min(DAILY_UNLIMITED - 1, num(dailyCaps[tier.capKey] ?? "")) : DAILY_UNLIMITED]} onValueChange={(v) => setDailyCaps(c => ({ ...c, [tier.capKey]: v[0] === undefined || v[0] >= DAILY_UNLIMITED ? "" : String(v[0]) }))} className="h-6" /></div>
                      </div>
                      {tier.questionsKey ? <div className="space-y-1 rounded-md bg-muted/40 p-2">
                        <div className="flex items-center justify-between"><span className="text-[11px] font-semibold">שאלות הסינון</span><Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => setEditingQuestions(tier.questionsKey)}><ListChecks className="h-3.5 w-3.5" />עריכה</Button></div>
                        {(tier.questionsKey === "phone" ? questionsPhone : questions).length ? <ol className="list-inside list-decimal space-y-0.5 text-xs">{(tier.questionsKey === "phone" ? questionsPhone : questions).map((q, i) => <li key={`${i}:${q}`}>{q}</li>)}</ol> : <p className="text-xs text-muted-foreground">לא הוגדרו שאלות</p>}
                      </div> : <div className="space-y-1 rounded-md bg-muted/40 p-2">
                        <div className="flex items-center justify-between"><span className="text-[11px] font-semibold">שדות בטופס דף נחיתה</span><Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => setFormFieldsOpen(true)}><Plus className="h-3.5 w-3.5" />הוספת שדה</Button></div>
                        <ol className="list-inside list-decimal space-y-0.5 text-xs"><li>שם מלא · חובה</li><li>טלפון · חובה</li>{formFields.filter(f => f.label.trim()).map(f => <li key={f.id}>{f.label} · {f.required ? "חובה" : "רשות"}</li>)}</ol>
                      </div>}
                    </>}
                  </div>
                ))}

                <ClosingFeeSlider dealType={listing.deal_type} price={Number(listing.asking_price) || 0} value={num(tier4)} valueType={tier4Type} onChange={(percent) => { setTier4Type("fixed"); setTier4(String(closingFeeAmount(percent, Number(listing.asking_price) || 0))); }} />
              </div>
            </>
          ) : null}
        </div>

        {enabled ? (
          <DialogFooter className="sticky bottom-0 z-10 -mx-6 flex-row items-center justify-between border-t bg-background px-6 py-3 sm:justify-between">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              ביטול
            </Button>
            <Button
              disabled={save.isPending || !(Number(listing.asking_price) > 0)}
              onClick={() =>
                save.mutate(
                  {
                    listingId: listing.id,
                    enabled,
                    rewardType,
                    rewardAmount: Number(amount) || 0,
                    tier1Amount: num(tier1),
                    tier2Amount: num(tier2),
                    tier3Type: "fixed",
                    tier3Amount: num(tier3),
                    tier4Type,
                    tier4Amount: num(tier4),
                    dailyLeadCap: null,
                    contactOptions: { ...listing.contact_options, form_fields: formFields.filter(f => f.label.trim()), lead_daily_limits: activeLeadLimits([num(tier1), num(tier2), num(tier3)], Object.fromEntries(Object.entries(dailyCaps).map(([key, value]) => [key, num(value)])) as LeadDailyLimits), ...deriveContactOptions({
                      tier1: num(tier1),
                      tier2: num(tier2),
                      tier3: num(tier3),
                      questions,
                      questionsPhone,
                    }) } as unknown as Record<string, unknown>,
                  },
                  {
                    onSuccess: () => {
                      toast.success("התגמול נשמר");
                      if (listing) { try { localStorage.removeItem(draftKey); } catch { /* noop */ } }
                      onOpenChange(false);
                    },
                    onError: () => toast.error("השמירה נכשלה"),
                  },
                )
              }
            >
              {save.isPending ? "שומר..." : "שמירה"}
            </Button>
          </DialogFooter>
        ) : null}

        <LeadFormFieldsDialog open={formFieldsOpen} onOpenChange={setFormFieldsOpen} fields={formFields} onChange={setFormFields} />
        <LeadQuestionsDialog
          open={editingQuestions !== null}
          onOpenChange={(v) => setEditingQuestions(v ? editingQuestions : null)}
          title={editingQuestions === "phone" ? "שאלות סינון · שיחת טלפון" : "שאלות סינון · שיחת WhatsApp"}
          questions={editingQuestions === "phone" ? questionsPhone : questions}
          onChange={(next) => {
            if (editingQuestions === "phone") {
              setQuestionsPhone(next);
              return;
            }
            setQuestions(next);
            // Level 3 mirrors the chat questions by default, still editable on its own.
            if (questionsPhone.join("|") === questions.join("|")) setQuestionsPhone(next);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
