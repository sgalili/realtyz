import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  CheckCircle2,
  Mail,
  MapPin,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { RealtyzLoader } from "@/components/RealtyzLoader";
import { officialWaLink, OFFICIAL_WABA_PHONE } from "@/lib/officialWa";
import { formatPhoneDisplay } from "@/lib/formatPhone";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/client-portal`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface Listing {
  id: string;
  property_title: string | null;
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
  slug: string | null;
}

interface PortalData {
  ok: boolean;
  lead: {
    id: string;
    full_name: string | null;
    city: string | null;
    neighborhood: string | null;
    deal_type: string | null;
    stage_key: string | null;
    stage_label: string;
  };
  listings: Listing[];
  agent: {
    name: string;
    email: string | null;
    whatsapp_phone: string | null;
    whatsapp_phone_display: string | null;
  };
  branding: {
    agency_name: string | null;
    logo_url: string | null;
    primary_color: string | null;
  };
}

const STAGE_ORDER = [
  { key: "new_lead", label: "פנייה ראשונית" },
  { key: "listing_outreach", label: "הצגת נכסים" },
  { key: "negotiation", label: "משא ומתן" },
  { key: "awaiting_signature", label: "חתימה" },
  { key: "closed", label: "סגירה" },
];

function formatPrice(n: number | null) {
  if (!n) return null;
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function ClientPortal() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${FN_URL}?token=${token}`, {
          headers: { apikey: ANON },
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Link unavailable");
        setData(json);
        if (json?.branding?.primary_color) {
          document.documentElement.style.setProperty(
            "--primary",
            json.branding.primary_color,
          );
        }
        const title = json?.branding?.agency_name
          ? `${json.branding.agency_name} · פורטל לקוח`
          : "פורטל לקוח · Realtyz AI";
        document.title = title;
      } catch (e: any) {
        setError(e?.message ?? "Unable to load portal");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const stageIndex = useMemo(() => {
    if (!data?.lead?.stage_key) return 0;
    const i = STAGE_ORDER.findIndex(
      (s) =>
        s.key === data.lead.stage_key ||
        (s.key === "negotiation" &&
          ["qualified", "meeting", "negotiation"].includes(
            data.lead.stage_key!,
          )),
    );
    return i < 0 ? 0 : i;
  }, [data]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RealtyzLoader size="lg" label="טוען פורטל…" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4 bg-muted/30"
        dir="rtl"
      >
        <Card className="p-8 max-w-md text-center space-y-3">
          <h1 className="text-xl font-semibold">הקישור אינו זמין</h1>
          <p className="text-sm text-muted-foreground">
            {error ?? "אנא בקש מהסוכן שלך קישור חדש."}
          </p>
        </Card>
      </div>
    );
  }

  const { lead, listings, agent, branding } = data;
  const firstName = (lead.full_name ?? "").split(" ")[0] || "שלום";

  // Always the official Meta WBA number — never the agent's personal number.
  const waLink = officialWaLink(
    `שלום ${agent.name}, יש לי שאלה לגבי הנכסים שהראית לי בפורטל.`,
  );
  const mailLink = agent.email
    ? `mailto:${agent.email}?subject=${encodeURIComponent("שאלה מפורטל הלקוח")}`
    : null;

  return (
    <div
      className="min-h-screen bg-gradient-to-b from-background to-muted/30"
      dir="rtl"
    >
      {/* Header */}
      <header className="border-b border-border/60 bg-card/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {branding.logo_url ? (
              <img
                src={branding.logo_url}
                alt={branding.agency_name ?? "agency"}
                className="h-8 w-auto"
              />
            ) : (
              <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
            )}
            <div>
              <p className="text-sm font-semibold leading-tight">
                {branding.agency_name ?? agent.name}
              </p>
              <p className="text-[11px] text-muted-foreground leading-tight">
                פורטל לקוח אישי
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-[10px]">
            מאובטח
          </Badge>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Greeting */}
        <section>
          <h1 className="text-2xl font-semibold tracking-tight">
            שלום {firstName} 👋
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            ריכזנו עבורך את סטטוס העסקה והנכסים שאנחנו בוחנים יחד.
          </p>
        </section>

        {/* Pipeline */}
        <section>
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
            סטטוס נוכחי בתהליך
          </h2>
          <Card className="p-5">
            <div className="flex items-center justify-between gap-2">
              {STAGE_ORDER.map((s, i) => {
                const done = i < stageIndex;
                const active = i === stageIndex;
                return (
                  <div
                    key={s.key}
                    className="flex-1 flex flex-col items-center gap-2"
                  >
                    <div
                      className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors ${
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : done
                            ? "bg-primary/15 text-primary border-primary/40"
                            : "bg-muted text-muted-foreground border-border"
                      }`}
                    >
                      {done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                    </div>
                    <span
                      className={`text-[11px] text-center leading-tight ${
                        active ? "text-foreground font-medium" : "text-muted-foreground"
                      }`}
                    >
                      {s.label}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 pt-4 border-t border-border/60 flex items-center justify-between">
              <p className="text-sm">
                שלב נוכחי:{" "}
                <span className="font-semibold text-primary">
                  {data.lead.stage_label}
                </span>
              </p>
              {lead.deal_type && (
                <Badge variant="secondary" className="text-[10px]">
                  {lead.deal_type === "rent" ? "השכרה" : "מכירה"}
                </Badge>
              )}
            </div>
          </Card>
        </section>

        {/* Properties */}
        <section>
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
            נכסים שאנו בוחנים יחד
          </h2>
          {listings.length === 0 ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              עדיין לא שותפו נכסים בפורטל. הסוכן יוסיף אותם בקרוב.
            </Card>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {listings.map((l) => (
                <Card key={l.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <Building2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {l.property_title ?? "נכס"}
                        </p>
                        {(l.city || l.neighborhood || l.address) && (
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
                            <MapPin className="h-3 w-3" />
                            {[l.neighborhood, l.city].filter(Boolean).join(", ") ||
                              l.address}
                          </p>
                        )}
                      </div>
                    </div>
                    {l.asking_price && (
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {formatPrice(l.asking_price)}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {l.rooms && (
                      <Badge variant="secondary" className="text-[10px]">
                        {l.rooms} חדרים
                      </Badge>
                    )}
                    {l.sqm && (
                      <Badge variant="secondary" className="text-[10px]">
                        {l.sqm} מ״ר
                      </Badge>
                    )}
                    {l.floor != null && (
                      <Badge variant="secondary" className="text-[10px]">
                        קומה {l.floor}
                      </Badge>
                    )}
                    {l.parking && (
                      <Badge variant="secondary" className="text-[10px]">
                        חניה
                      </Badge>
                    )}
                    {l.elevator && (
                      <Badge variant="secondary" className="text-[10px]">
                        מעלית
                      </Badge>
                    )}
                  </div>
                  {l.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {l.description}
                    </p>
                  )}
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Contact agent */}
        <section>
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
            צריך משהו?
          </h2>
          <Card className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">{agent.name}</p>
              <p className="text-xs text-muted-foreground">
                המתווך/ת שלך — זמין/ה לכל שאלה
              </p>
              {/* Only the official Meta WBA number is ever shown publicly. */}
              <p className="text-xs text-muted-foreground mt-1" dir="ltr">
                {formatPhoneDisplay(OFFICIAL_WABA_PHONE)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {waLink && (
                <Button asChild>
                  <a href={waLink} target="_blank" rel="noreferrer">
                    <MessageCircle className="h-4 w-4 ml-1" />
                    שלח/י WhatsApp
                  </a>
                </Button>
              )}
              {mailLink && (
                <Button variant="outline" asChild>
                  <a href={mailLink}>
                    <Mail className="h-4 w-4 ml-1" />
                    אימייל
                  </a>
                </Button>
              )}
            </div>
          </Card>
        </section>

        <footer className="pt-6 pb-10 text-center text-[11px] text-muted-foreground">
          מופעל על ידי <span className="font-medium">Realtyz AI</span>
        </footer>
      </main>
    </div>
  );
}
