import { useEffect, useState } from 'react';
import { ClipboardList, ListChecks, Phone, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
      <DialogContent dir="rtl" className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-right">תמחור לידים · {listing.property_title || "נכס"}</DialogTitle>
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
                      <div className="text-muted-foreground">ליד דיגיטלי</div>
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
                    <div className="flex flex-wrap items-end gap-2">
                      <Input
                        className="min-w-0 flex-1"
                        aria-label={`עמלה עבור ${tier.title}`}
                        value={tier.value}
                        inputMode="decimal"
                        onChange={(e) => tier.setValue(clean(e.target.value))}
                      />
                      {num(tier.value) > 0 && <div className="w-28 shrink-0"><Label htmlFor={`cap-${tier.key}`} className="text-[11px]">מקס׳ ב־24 שעות</Label><Input id={`cap-${tier.key}`} aria-label={`מגבלה יומית עבור ${tier.title}`} inputMode="numeric" placeholder="ללא מגבלה" value={dailyCaps[tier.capKey] ?? ""} onChange={(event) => setDailyCaps(current => ({ ...current, [tier.capKey]: event.target.value.replace(/\D/g, "") }))} /></div>}
                      <span className="w-full text-[11px] text-muted-foreground">
                        מחיר ליד: <bdi dir="ltr">₪{tier.cost.toLocaleString("he-IL")}</bdi>
                      </span>
                    </div>
                  </div>
                ))}

                <ClosingFeeSlider dealType={listing.deal_type} price={Number(listing.asking_price) || 0} value={num(tier4)} valueType={tier4Type} onChange={(percent) => { setTier4Type("fixed"); setTier4(String(closingFeeAmount(percent, Number(listing.asking_price) || 0))); }} />
              </div>
            </>
          ) : null}
        </div>

        {enabled ? (
          <DialogFooter className="flex-row items-center justify-between sm:justify-between">
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
                    contactOptions: { ...listing.contact_options, lead_daily_limits: activeLeadLimits([num(tier1), num(tier2), num(tier3)], Object.fromEntries(Object.entries(dailyCaps).map(([key, value]) => [key, num(value)])) as LeadDailyLimits), ...deriveContactOptions({
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
