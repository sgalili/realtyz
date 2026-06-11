import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Phone, Loader2, PhoneCall, BarChart3, Pencil, X, Upload, Check,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatPhoneDisplay } from "@/lib/formatPhone";

type AudienceMode = "all" | "manual" | "csv" | "paste";

export default function AiDialer() {
  const [aiActive, setAiActive] = useState(true);
  const [tab, setTab] = useState<"outbound" | "analytics">("outbound");

  const [voiceId, setVoiceId] = useState<string>("");
  const [audience, setAudience] = useState<AudienceMode | "">("");
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [csvPhones, setCsvPhones] = useState<string[]>([]);
  const [pasteText, setPasteText] = useState("");
  const csvInputRef = useRef<HTMLInputElement>(null);

  const [instructions, setInstructions] = useState("");
  const [editingPill, setEditingPill] = useState(false);
  const [pillLabel, setPillLabel] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: leads = [] } = useQuery({
    queryKey: ["dialer-leads-all"],
    queryFn: async () => {
      const { data } = await supabase.from("leads")
        .select("id, full_name, phone_number, city")
        .not("phone_number", "is", null)
        .order("full_name", { ascending: true })
        .limit(1000);
      return data ?? [];
    },
  });

  const { data: voices = [] } = useQuery({
    queryKey: ["dialer-voices"],
    queryFn: async () => {
      const { data } = await supabase.from("cloned_voices")
        .select("id, name, voice_id")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: minutes = 152 } = useQuery({
    queryKey: ["dialer-minutes"],
    queryFn: async () => {
      const { data } = await supabase.from("api_configs").select("service_name, api_key").eq("service_name", "VoiceMinutes").maybeSingle();
      const v = Number(data?.api_key ?? 152);
      return Number.isFinite(v) ? v : 152;
    },
  });

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    const digits = q.replace(/\D/g, "");
    return (leads as any[]).filter((l) =>
      (l.full_name ?? "").toLowerCase().includes(q) ||
      (digits.length > 0 && (l.phone_number ?? "").replace(/\D/g, "").includes(digits)),
    );
  }, [leads, search]);

  const toggleAllFiltered = () => {
    const all = filteredLeads.every((l: any) => selectedLeadIds.has(l.id));
    setSelectedLeadIds((prev) => {
      const n = new Set(prev);
      filteredLeads.forEach((l: any) => all ? n.delete(l.id) : n.add(l.id));
      return n;
    });
  };

  const handleCsvFile = async (f: File) => {
    const text = await f.text();
    const phones = Array.from(text.matchAll(/(\+?\d[\d\-\s().]{6,}\d)/g)).map((m) => m[1].replace(/\D/g, ""));
    const unique = Array.from(new Set(phones)).filter((p) => p.length >= 9);
    setCsvPhones(unique);
    toast.success(`נטענו ${unique.length} מספרים`);
  };

  const parsedPaste = useMemo(() => {
    const phones = Array.from(pasteText.matchAll(/(\+?\d[\d\-\s().]{6,}\d)/g)).map((m) => m[1].replace(/\D/g, ""));
    return Array.from(new Set(phones)).filter((p) => p.length >= 9);
  }, [pasteText]);

  const targets = useMemo(() => {
    if (audience === "all") return (leads as any[]).map((l) => ({ id: l.id, phone: l.phone_number, name: l.full_name }));
    if (audience === "manual") return (leads as any[]).filter((l) => selectedLeadIds.has(l.id)).map((l) => ({ id: l.id, phone: l.phone_number, name: l.full_name }));
    if (audience === "csv") return csvPhones.map((p) => ({ phone: p }));
    if (audience === "paste") return parsedPaste.map((p) => ({ phone: p }));
    return [];
  }, [audience, leads, selectedLeadIds, csvPhones, parsedPaste]);

  const audienceLabel = useMemo(() => {
    if (!audience) return "למי מחייגים?";
    if (audience === "all") return `כל הרשימה (${leads.length})`;
    if (audience === "manual") return `בחירה מהרשימה (${selectedLeadIds.size})`;
    if (audience === "csv") return `העלאת רשימה (${csvPhones.length})`;
    if (audience === "paste") return `הדבקת טקסט (${parsedPaste.length})`;
    return "למי מחייגים?";
  }, [audience, leads.length, selectedLeadIds.size, csvPhones.length, parsedPaste.length]);

  const showActions = !!voiceId && !!audience;

  const startCalls = async () => {
    if (targets.length === 0) { toast.error("בחרו רשימת יעד"); return; }
    setLoading(true);
    try {
      let ok = 0, failed = 0;
      for (const t of targets) {
        try {
          const { error } = await supabase.functions.invoke("vapi-outbound-call", {
            body: { phone_number: t.phone, lead_id: (t as any).id, voice_id: voiceId, instructions: instructions || undefined },
          });
          if (error) failed++; else ok++;
        } catch { failed++; }
      }
      toast.success(`הופעלו ${ok} שיחות${failed ? ` · ${failed} נכשלו` : ""}`);
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-muted/20" dir="rtl">
      {/* Header bar */}
      <div className="bg-gradient-to-b from-[#0a1430] to-[#1e3a5f] text-white">
        <div className="container max-w-2xl py-6">
          <h1 className="text-2xl font-bold text-center">שיחות טלפוניות AI</h1>
        </div>
        <svg viewBox="0 0 1440 40" preserveAspectRatio="none" className="w-full h-6 text-muted/20 fill-current">
          <path d="M0,32 C320,0 720,40 1440,8 L1440,40 L0,40 Z" />
        </svg>
      </div>

      <div className="container max-w-2xl py-4 space-y-5">
        {/* Active switch bar */}
        <div className="rounded-2xl border border-[#0f1b3d]/15 bg-[#eef3fb] p-4 flex items-center justify-between">
          <span className="text-[15px] font-semibold text-[#0f1b3d]">שיחות טלפון AI פעילות</span>
          <Switch checked={aiActive} onCheckedChange={setAiActive}
            className="data-[state=checked]:bg-emerald-500" />
        </div>

        {/* Tabs */}
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => setTab("outbound")}
            className={cn(
              "flex items-center gap-2 h-11 px-5 rounded-xl text-sm font-semibold border transition-colors",
              tab === "outbound"
                ? "bg-[#0a1430] text-white border-[#0a1430] shadow-sm"
                : "bg-background text-[#0f1b3d] border-[#0f1b3d]/15 hover:bg-muted/40",
            )}>
            <PhoneCall className="h-4 w-4" /> שיחות יוצאות
          </button>
          <button onClick={() => setTab("analytics")}
            className={cn(
              "flex items-center gap-2 h-11 px-5 rounded-xl text-sm font-semibold border transition-colors",
              tab === "analytics"
                ? "bg-[#0a1430] text-white border-[#0a1430] shadow-sm"
                : "bg-background text-[#0f1b3d] border-[#0f1b3d]/15 hover:bg-muted/40",
            )}>
            <BarChart3 className="h-4 w-4" /> ניתוח שיחות
          </button>
        </div>

        {tab === "outbound" && (
          <>
            {/* Cascading steps card */}
            <div className="rounded-2xl border border-[#0f1b3d]/15 bg-background p-4 space-y-3">
              <div className="relative">
                <Select value={voiceId} onValueChange={setVoiceId} dir="rtl">
                  <SelectTrigger className="w-full h-12 text-center font-semibold border-[#0f1b3d]/20 rounded-xl">
                    <SelectValue placeholder="בחירת נציג/ת AI טלפונית" />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    {(voices as any[]).map((v) => (
                      <SelectItem key={v.id} value={v.voice_id}>{v.name}</SelectItem>
                    ))}
                    <SelectItem value="XrExE9yKIg1WjnnlVkGX">נציגת מכירות דיגיטלית</SelectItem>
                    <SelectItem value="EXAVITQu4vr4xnSDxMaL">שירות דיירים</SelectItem>
                    <SelectItem value="IKne3meq5aSn9XLyUdCD">נציג מתווך (גבר)</SelectItem>
                  </SelectContent>
                </Select>
                {voiceId && (
                  <Check className="absolute -left-6 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-600" />
                )}
              </div>

              {voiceId && (
                <Select value={audience} onValueChange={(v) => setAudience(v as AudienceMode)} dir="rtl">
                  <SelectTrigger className="w-full h-12 text-center font-semibold border-[#0f1b3d]/20 rounded-xl">
                    <SelectValue placeholder="למי מחייגים?">{audienceLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="all">כל הרשימה ({leads.length})</SelectItem>
                    <SelectItem value="manual">בחירה מהרשימה</SelectItem>
                    <SelectItem value="csv">העלאת רשימה (CSV / Excel)</SelectItem>
                    <SelectItem value="paste">הדבקת טקסט</SelectItem>
                  </SelectContent>
                </Select>
              )}

              {audience === "manual" && (
                <div className="rounded-xl border border-[#0f1b3d]/15 bg-background">
                  <div className="p-2 border-b border-[#0f1b3d]/10">
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש..." className="text-right h-9" />
                  </div>
                  <label className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/40 border-b border-[#0f1b3d]/10 cursor-pointer">
                    <span className="text-xs font-semibold text-[#0f1b3d]">בחר הכל ({filteredLeads.length})</span>
                    <Checkbox checked={filteredLeads.length > 0 && filteredLeads.every((l: any) => selectedLeadIds.has(l.id))}
                      onCheckedChange={toggleAllFiltered} />
                  </label>
                  <div className="max-h-40 overflow-y-auto divide-y divide-border/50">
                    {filteredLeads.map((l: any) => (
                      <label key={l.id} className="flex items-center justify-between gap-3 px-3 py-2 cursor-pointer hover:bg-muted/40">
                        <div className="flex-1 min-w-0 text-right">
                          <div className="text-sm font-medium truncate">{l.full_name || "ללא שם"}</div>
                          <div className="text-[11px] text-muted-foreground font-mono" dir="ltr">{formatPhoneDisplay(l.phone_number)}</div>
                        </div>
                        <Checkbox checked={selectedLeadIds.has(l.id)} onCheckedChange={() => {
                          setSelectedLeadIds((p) => { const n = new Set(p); n.has(l.id) ? n.delete(l.id) : n.add(l.id); return n; });
                        }} />
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {audience === "csv" && (
                <div className="rounded-xl border border-[#0f1b3d]/15 bg-background p-3 space-y-2">
                  <input ref={csvInputRef} type="file" accept=".csv,.xlsx,.xls,text/csv" className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleCsvFile(e.target.files[0])} />
                  <Button variant="outline" onClick={() => csvInputRef.current?.click()} className="w-full rounded-lg">
                    <Upload className="ml-2 h-4 w-4" /> בחירת קובץ CSV / Excel
                  </Button>
                  {csvPhones.length > 0 && (
                    <div className="text-[11px] text-muted-foreground text-right">נטענו {csvPhones.length} מספרים</div>
                  )}
                </div>
              )}

              {audience === "paste" && (
                <Textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)}
                  placeholder="הדביקו מספרי טלפון..." className="text-right min-h-[90px] rounded-xl border-[#0f1b3d]/20" />
              )}
            </div>

            {/* Custom script + dispatch */}
            {showActions && (
              <div className="rounded-2xl border border-[#0f1b3d]/15 bg-background p-4 space-y-3">
                <label className="text-[13px] font-semibold text-[#0f1b3d] text-right block">
                  הוראות, נושא או תסריט מותאם לשיחה (אופציונלי)
                </label>
                <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)}
                  className="text-right min-h-[110px] rounded-xl border-[#0f1b3d]/20 bg-muted/30" />
                <p className="text-[11.5px] text-muted-foreground text-right leading-snug">
                  אם תשאירי ריק, המערכת תשתמש באסטרטגיה האוטונומית הרגילה שלה המבוססת על הפרסונה של המתווך, על מאגר הידע ועל היסטוריית השיחות עם הלקוח.
                </p>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <Check className="h-4 w-4 text-emerald-600" />
                  <Button onClick={startCalls} disabled={loading || targets.length === 0}
                    className="bg-[#0a1430] hover:bg-[#1e3a5f] text-white h-11 px-6 rounded-xl font-semibold">
                    {loading ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Phone className="ml-2 h-4 w-4" />}
                    הפעלת שיחה
                  </Button>
                </div>

                {/* Loaded list pill */}
                {targets.length > 0 && (
                  <div className="rounded-xl border border-[#0f1b3d]/15 bg-muted/30 px-3 py-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setAudience("")} className="h-7 w-7 rounded-md hover:bg-background flex items-center justify-center">
                        <X className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                      <button type="button" onClick={() => setEditingPill((v) => !v)} className="h-7 w-7 rounded-md hover:bg-background flex items-center justify-center">
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </div>
                    <div className="text-[12.5px] text-[#0f1b3d] text-right font-medium">
                      {editingPill ? (
                        <input autoFocus value={pillLabel || `רשימה נטענה · ${targets.length} אנשי קשר`}
                          onChange={(e) => setPillLabel(e.target.value)} onBlur={() => setEditingPill(false)}
                          className="bg-transparent border-b border-[#0f1b3d]/30 text-right outline-none" />
                      ) : (
                        pillLabel || `רשימה נטענה · ${targets.length} אנשי קשר`
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Footer minutes balance */}
            <div className="flex items-center justify-between px-1 pt-1">
              <button type="button" onClick={() => toast.info("טעינת יתרת דקות בקרוב")}
                className="text-[12px] text-[#0f1b3d] underline hover:text-[#1e3a5f] font-semibold">
                הטענת יתרה
              </button>
              <div className="text-[12px] text-muted-foreground">
                יתרת דקות זמינה: <span className="font-bold text-[#0f1b3d]">{Number(minutes).toFixed(2)}</span> (1.00 ₪ לדקה)
              </div>
            </div>
          </>
        )}

        {tab === "analytics" && (
          <div className="rounded-2xl border border-[#0f1b3d]/15 bg-background p-8 text-center text-sm text-muted-foreground">
            ניתוח שיחות יוצג כאן בקרוב.
          </div>
        )}
      </div>
    </div>
  );
}
