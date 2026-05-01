// Action Items — Outreach Engine UI
// Lists AI-suggested follow-up cards for the current Agent. Each card shows:
//   - Lead, trigger reason, draft preview, tier, "AI Generated Suggestion" tag
//   - One-click "Use Draft" → opens the Smart Reply sheet pre-filled with the suggested message
//   - "Dismiss" to remove
// Header includes a "Scan Now" button (invokes outreach-suggest edge fn) and an
// "Auto-Draft Policy" popover where the Agent toggles which loyalty tiers receive
// auto-drafted follow-ups (Hot Lead, Loyal, Undecided, etc.).
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sparkles,
  Wand2,
  X,
  Settings2,
  Bot,
  Clock,
  TrendingDown,
  ThermometerSnowflake,
  Calendar,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Suggestion = {
  id: string;
  lead_id: string;
  trigger_type: string;
  trigger_reason: string;
  draft_message: string;
  tier: string | null;
  status: string;
  metadata: Record<string, any> | null;
  created_at: string;
  lead?: {
    id: string;
    full_name: string | null;
    phone_number: string;
    city: string | null;
    profile_picture_url: string | null;
    last_interaction_at: string | null;
    lead_stage: string | null;
    interest_tag: string | null;
  } | null;
};

const TRIGGER_META: Record<string, { label: string; icon: typeof Clock; tone: string }> = {
  post_viewing_24h: { label: "מעקב 24 שעות", icon: Calendar, tone: "text-primary" },
  stale_negotiation: { label: "מו״מ תקוע", icon: Clock, tone: "text-warning" },
  cold_reengage: { label: "חימום מחדש", icon: ThermometerSnowflake, tone: "text-muted-foreground" },
  price_drop: { label: "התאמת ירידת מחיר", icon: TrendingDown, tone: "text-success" },
};

// Common loyalty tiers — the Agent can flip auto-draft per tier.
const KNOWN_TIERS = ["מתעניין חם", "נאמן", "מתלבט", "מתעניין קר"];

type Props = {
  onUseDraft: (suggestion: Suggestion) => void;
};

export function ActionItemsPanel({ onUseDraft }: Props) {
  const qc = useQueryClient();
  const [scanning, setScanning] = useState(false);

  const { data: suggestions, isLoading } = useQuery({
    queryKey: ["outreach-suggestions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("outreach_suggestions")
        .select(
          `id, lead_id, trigger_type, trigger_reason, draft_message, tier, status, metadata, created_at,
           lead:leads ( id, full_name, phone_number, city, profile_picture_url, last_interaction_at, lead_stage, interest_tag )`
        )
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as unknown as Suggestion[];
    },
  });

  const { data: policies } = useQuery({
    queryKey: ["outreach-auto-policies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("outreach_auto_policies")
        .select("tier, auto_draft");
      if (error) throw error;
      return data || [];
    },
  });

  const policyMap = useMemo(() => {
    const m = new Map<string, boolean>();
    (policies || []).forEach((p: any) => m.set(p.tier, p.auto_draft));
    return m;
  }, [policies]);

  async function togglePolicy(tier: string, next: boolean) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    // Upsert by (user_id, tier)
    const { error } = await supabase.from("outreach_auto_policies").upsert(
      { user_id: user.id, tier, auto_draft: next },
      { onConflict: "user_id,tier" }
    );
    if (error) {
      toast.error("שמירת המדיניות נכשלה", { description: error.message });
      return;
    }
    qc.invalidateQueries({ queryKey: ["outreach-auto-policies"] });
  }

  async function runScan() {
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke("outreach-suggest", { body: {} });
      if (error) throw error;
      const inserted = (data as any)?.inserted ?? 0;
      toast.success(
        inserted > 0 ? `נמצאו ${inserted} פעולות חדשות` : "אין טריגרים חדשים כרגע"
      );
      qc.invalidateQueries({ queryKey: ["outreach-suggestions"] });
    } catch (err: any) {
      toast.error("הסריקה נכשלה", { description: err?.message });
    } finally {
      setScanning(false);
    }
  }

  async function dismiss(id: string) {
    const { error } = await supabase
      .from("outreach_suggestions")
      .update({ status: "dismissed", dismissed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast.error("הדחייה נכשלה", { description: error.message });
      return;
    }
    qc.invalidateQueries({ queryKey: ["outreach-suggestions"] });
  }

  const items = suggestions || [];

  return (
    <section className="rounded-xl border bg-gradient-to-br from-primary/[0.03] via-background to-background">
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b flex-wrap">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Wand2 className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold leading-tight">פעולות מומלצות</h2>
            <p className="text-[11px] text-muted-foreground leading-tight">
              מעקבים יזומים שמציעה מנוע הפנייה
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs font-normal">
            {items.length} ממתינות
          </Badge>
          <Button size="sm" variant="outline" onClick={runScan} disabled={scanning} className="gap-1.5 h-8">
            <RefreshCw className={cn("h-3.5 w-3.5", scanning && "animate-spin")} />
            {scanning ? "סורק…" : "סריקה עכשיו"}
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5 h-8">
                <Settings2 className="h-3.5 w-3.5" />
                טיוטה אוטומטית
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72">
              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-medium">טיוטה אוטומטית לפי דרגה</h3>
                  <p className="text-[11px] text-muted-foreground">
                    כשפעיל, מעקבים מומלצים לדרגות אלה ינוסחו אוטומטית על ידי ה-AI
                    ויחכו כאן לאישור בלחיצה אחת.
                  </p>
                </div>
                <div className="space-y-2">
                  {KNOWN_TIERS.map((tier) => {
                    const enabled = policyMap.get(tier) ?? false;
                    return (
                      <div key={tier} className="flex items-center justify-between text-sm">
                        <span>{tier}</span>
                        <Switch
                          checked={enabled}
                          onCheckedChange={(v) => togglePolicy(tier, v)}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </header>

      <div className="p-3">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-36 w-full rounded-lg" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground py-8">
            <Bot className="h-6 w-6 mx-auto mb-2 opacity-40" />
            אין פעולות ממתינות כרגע. לחצו <span className="font-medium">סריקה עכשיו</span> כדי לרענן.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {items.map((s) => {
              const meta = TRIGGER_META[s.trigger_type] || {
                label: s.trigger_type,
                icon: Sparkles,
                tone: "text-primary",
              };
              const Icon = meta.icon;
              const autoDrafted = !!s.metadata?.auto_drafted;
              return (
                <Card key={s.id} className="p-3 flex flex-col gap-2 border bg-background">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Icon className={cn("h-4 w-4 shrink-0", meta.tone)} />
                      <span className="text-xs font-medium truncate">{meta.label}</span>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 shrink-0 -mt-1 -ms-1"
                      onClick={() => dismiss(s.id)}
                      title="דחייה"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="text-sm font-medium truncate">
                    {s.lead?.full_name || "לקוח ללא שם"}
                  </div>
                  <div className="text-[11px] text-muted-foreground -mt-1 truncate">
                    {s.trigger_reason}
                  </div>

                  <div className="rounded-md border-2 border-dashed border-primary/25 bg-primary/[0.03] p-2 text-xs leading-relaxed text-foreground/90 line-clamp-3">
                    {s.draft_message}
                  </div>

                  <div className="flex items-center justify-between gap-2 mt-1 flex-wrap">
                    <div className="flex items-center gap-1 flex-wrap">
                      <Badge
                        variant="outline"
                        className="gap-1 text-[10px] font-normal border-primary/30 bg-primary/5 text-primary"
                      >
                        <Sparkles className="h-2.5 w-2.5" />
                        הצעת AI
                      </Badge>
                      {autoDrafted && (
                        <Badge variant="outline" className="text-[10px] font-normal">
                          טיוטה אוטומטית
                        </Badge>
                      )}
                      {s.tier && (
                        <Badge variant="secondary" className="text-[10px] font-normal">
                          {s.tier}
                        </Badge>
                      )}
                    </div>
                    <Button size="sm" className="h-7 text-xs gap-1" onClick={() => onUseDraft(s)}>
                      <Sparkles className="h-3 w-3" />
                      שימוש בטיוטה
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
