// Anti-fraud guard for public inquiries (service-role only tables).
// - Hard daily cap per phone / device / IP.
// - Geographic pattern: 3+ distinct cities within one hour => verification questionnaire.
const DAILY_CAP = 5;
const GEO_WINDOW_MS = 60 * 60 * 1000;
const GEO_CITY_LIMIT = 3;
const CLEAR_MS = 24 * 60 * 60 * 1000;

export type GuardId = { phone: string | null; device: string | null; ip: string | null };

export async function guardIdentity(req: Request, body: any, phone: string | null): Promise<GuardId> {
  const device = typeof body?.device_id === "string" && /^[A-Za-z0-9-]{8,64}$/.test(body.device_id) ? body.device_id : null;
  const rawIp = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "";
  let ip: string | null = null;
  if (rawIp) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`rz-guard:${rawIp}`));
    ip = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
  }
  return { phone, device, ip };
}

function orFilter(id: GuardId) {
  const parts: string[] = [];
  if (id.phone) parts.push(`phone.eq.${id.phone}`);
  if (id.device) parts.push(`device_id.eq.${id.device}`);
  if (id.ip) parts.push(`ip_hash.eq.${id.ip}`);
  return parts.join(",");
}

const cityKey = (c: unknown) => String(c ?? "").replace(/[\s"'״׳-]+/g, "").trim();

export const QUESTIONS = [
  { id: "goal", label: "מה מטרת הפניות שלך?", options: ["אני מחפש/ת נכס לעצמי", "אני מחפש/ת עבור בן משפחה", "אני מתווך/ת או משווק/ת", "אחר"] },
  { id: "area", label: "באיזה אזור את/ה מחפש/ת בפועל?", options: [] as string[] },
  { id: "timeline", label: "מתי את/ה מתכנן/ת לעבור?", options: ["תוך חודש", "תוך 1-3 חודשים", "תוך 3-6 חודשים", "רק בודק/ת שוק"] },
];

/** Returns null when allowed, or a JSON-able response describing the block/challenge. */
export async function checkGuard(admin: any, id: GuardId, city: string | null, challengeAnswer?: any): Promise<Record<string, unknown> | null> {
  const filter = orFilter(id);
  if (!filter) return null;
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: events } = await admin.from("inquiry_guard_events").select("city, created_at").or(filter).gte("created_at", since).order("created_at", { ascending: false }).limit(50);
  const list: Array<{ city: string | null; created_at: string }> = events ?? [];
  if (list.length >= DAILY_CAP) {
    return { blocked: true, error: `הגעת למכסת ${DAILY_CAP} פניות ביום. אפשר לפנות שוב מחר.` };
  }

  // Already cleared recently?
  const { data: cleared } = await admin.from("inquiry_guard_challenges").select("id").or(filter).eq("status", "cleared").gt("cleared_until", new Date().toISOString()).limit(1);
  if (cleared?.length) return null;

  const hourAgo = Date.now() - GEO_WINDOW_MS;
  const cities = new Map<string, string>();
  for (const e of list) if (e.city && new Date(e.created_at).getTime() >= hourAgo) cities.set(cityKey(e.city), e.city);
  if (city) cities.set(cityKey(city), city);
  if (cities.size < GEO_CITY_LIMIT) return null;

  const cityNames = [...cities.values()];
  // Visitor submitted answers for a pending challenge.
  if (challengeAnswer?.id) {
    const { data: ch } = await admin.from("inquiry_guard_challenges").select("id, status, attempts, cities").eq("id", String(challengeAnswer.id)).maybeSingle();
    if (ch && ch.status === "pending" && ch.attempts < 3) {
      const a = challengeAnswer.answers ?? {};
      const goalOk = ["אני מחפש/ת נכס לעצמי", "אני מחפש/ת עבור בן משפחה"].includes(a.goal);
      const areaOk = typeof a.area === "string" && (ch.cities ?? []).includes(a.area);
      const timeOk = ["תוך חודש", "תוך 1-3 חודשים", "תוך 3-6 חודשים"].includes(a.timeline);
      if (goalOk && areaOk && timeOk) {
        await admin.from("inquiry_guard_challenges").update({ status: "cleared", cleared_until: new Date(Date.now() + CLEAR_MS).toISOString() }).eq("id", ch.id);
        return null;
      }
      const attempts = ch.attempts + 1;
      await admin.from("inquiry_guard_challenges").update({ attempts, status: attempts >= 3 ? "suspended" : "pending" }).eq("id", ch.id);
      if (attempts >= 3) return { blocked: true, error: "שליחת פניות הושעתה זמנית. נסו שוב מאוחר יותר." };
      return { verify: { id: ch.id, questions: withArea(ch.cities ?? cityNames) }, error: "התשובות אינן תואמות פנייה אמיתית. נסו שוב." };
    }
  }

  const { data: suspended } = await admin.from("inquiry_guard_challenges").select("id").or(filter).eq("status", "suspended").gte("created_at", since).limit(1);
  if (suspended?.length) return { blocked: true, error: "שליחת פניות הושעתה זמנית. נסו שוב מאוחר יותר." };

  const { data: created } = await admin.from("inquiry_guard_challenges").insert({ phone: id.phone, device_id: id.device, ip_hash: id.ip, cities: cityNames }).select("id").single();
  console.warn("[public-lead-gate] geo pattern flagged", { cities: cityNames.length });
  return { verify: { id: created?.id, questions: withArea(cityNames) } };
}

function withArea(cities: string[]) {
  return QUESTIONS.map((q) => (q.id === "area" ? { ...q, options: [...cities, "כל האזורים האלה"] } : q));
}

export async function recordGuard(admin: any, id: GuardId, listingId: string, city: string | null, action: string) {
  await admin.from("inquiry_guard_events").insert({ phone: id.phone, device_id: id.device, ip_hash: id.ip, listing_id: listingId, city, action }).then(() => {}, () => {});
}
