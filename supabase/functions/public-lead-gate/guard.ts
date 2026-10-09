// Anti-fraud guard for public inquiries (service-role only tables).
// - Hard daily cap per phone / device / IP.
// - High volume (VOLUME_OTP+ inquiries today) => mandatory SMS OTP.
// - Geographic pattern: two inquiries >= GEO_DISTANCE_KM apart (or 3+ distinct
//   cities) within one hour => verification questionnaire + mandatory SMS OTP.
import { sendSms019 } from "../_shared/sms019.ts";

const DAILY_CAP = 5;
const VOLUME_OTP = 3;
const GEO_WINDOW_MS = 60 * 60 * 1000;
const GEO_CITY_LIMIT = 3;
const GEO_DISTANCE_KM = 80;
const CLEAR_MS = 24 * 60 * 60 * 1000;
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_SENDS = 3;
const MAX_ATTEMPTS = 3;

export type GuardId = { phone: string | null; device: string | null; ip: string | null };
export type Geo = { city: string | null; lat: number | null; lng: number | null };

// Fallback coordinates when a listing has no stored location.
const CITY_COORDS: Record<string, [number, number]> = {
  "תלאביב": [32.08, 34.78], "תלאביביפו": [32.08, 34.78], "ירושלים": [31.77, 35.21], "חיפה": [32.79, 34.99],
  "ראשוןלציון": [31.97, 34.79], "פתחתקווה": [32.09, 34.88], "אשדוד": [31.80, 34.65], "נתניה": [32.32, 34.85],
  "בארשבע": [31.25, 34.79], "בנישראל": [32.16, 34.84], "חולון": [32.01, 34.78], "רמתגן": [32.07, 34.82],
  "אשקלון": [31.67, 34.57], "רחובות": [31.89, 34.81], "בתים": [32.02, 34.75], "בתיים": [32.02, 34.75], "כפרסבא": [32.18, 34.91],
  "הרצליה": [32.16, 34.84], "חדרה": [32.43, 34.92], "מודיעין": [31.90, 35.01], "נצרת": [32.70, 35.30],
  "רעננה": [32.18, 34.87], "אילת": [29.56, 34.95], "טבריה": [32.79, 35.53], "עכו": [32.93, 35.08],
  "נהריה": [33.01, 35.10], "ראשהנקרה": [33.09, 35.11], "קריתשמונה": [33.21, 35.57], "צפת": [32.96, 35.50],
  "עפולה": [32.61, 35.29], "דימונה": [31.07, 35.03], "ערד": [31.26, 35.21], "קריתגת": [31.61, 34.76],
  "הודהשרון": [32.15, 34.89], "גבעתיים": [32.07, 34.81], "רמלה": [31.93, 34.87], "לוד": [31.95, 34.89],
};

const cityKey = (c: unknown) => String(c ?? "").replace(/[\s"'״׳-]+/g, "").trim();

export function geoOf(listing: any): Geo {
  const lat = Number(listing?.latitude), lng = Number(listing?.longitude);
  const city = listing?.city ?? null;
  if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) return { city, lat, lng };
  const c = CITY_COORDS[cityKey(city)];
  return { city, lat: c?.[0] ?? null, lng: c?.[1] ?? null };
}

function km(a: Geo, b: Geo): number {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return 0;
  const R = 6371, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function sha(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function guardIdentity(req: Request, body: any, phone: string | null): Promise<GuardId> {
  const device = typeof body?.device_id === "string" && /^[A-Za-z0-9-]{8,64}$/.test(body.device_id) ? body.device_id : null;
  const rawIp = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "";
  const ip = rawIp ? (await sha(`rz-guard:${rawIp}`)).slice(0, 32) : null;
  return { phone, device, ip };
}

function orFilter(id: GuardId) {
  const parts: string[] = [];
  if (id.phone) parts.push(`phone.eq.${id.phone}`);
  if (id.device) parts.push(`device_id.eq.${id.device}`);
  if (id.ip) parts.push(`ip_hash.eq.${id.ip}`);
  return parts.join(",");
}

export const QUESTIONS = [
  { id: "goal", label: "מה מטרת הפניות שלך?", options: ["אני מחפש/ת נכס לעצמי", "אני מחפש/ת עבור בן משפחה", "אני מתווך/ת או משווק/ת", "אחר"] },
  { id: "area", label: "באיזה אזור את/ה מחפש/ת בפועל?", options: [] as string[] },
  { id: "timeline", label: "מתי את/ה מתכנן/ת לעבור?", options: ["תוך חודש", "תוך 1-3 חודשים", "תוך 3-6 חודשים", "רק בודק/ת שוק"] },
];

function withArea(cities: string[]) {
  return QUESTIONS.map((q) => (q.id === "area" ? { ...q, options: [...cities, "כל האזורים האלה"] } : q));
}

const maskPhone = (p: string | null) => (p ? `***-***${p.slice(-4)}` : null);
const SUSPENDED = { blocked: true, error: "שליחת פניות הושעתה זמנית. נסו שוב מאוחר יותר." };

async function sendOtp(admin: any, ch: { id: string; otp_sent_count?: number }, phone: string, workspaceOwnerId: string | null) {
  if ((ch.otp_sent_count ?? 0) >= OTP_MAX_SENDS) return { ok: false, error: "נשלחו יותר מדי קודים. נסו שוב מאוחר יותר." };
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
  const res = await sendSms019(admin, phone, `קוד האימות שלך ב-Realtyz: ${code}\nהקוד בתוקף ל-10 דקות.`, workspaceOwnerId);
  if (!res.ok) {
    console.error("[public-lead-gate] otp send failed", { error: res.error });
    return { ok: false, error: "לא הצלחנו לשלוח קוד אימות. נסו שוב בעוד מספר דקות." };
  }
  await admin.from("inquiry_guard_challenges").update({
    otp_hash: await sha(`rz-otp:${ch.id}:${code}`),
    otp_expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
    otp_sent_count: (ch.otp_sent_count ?? 0) + 1,
  }).eq("id", ch.id);
  return { ok: true };
}

function verifyPayload(ch: any, phone: string | null, extra: Record<string, unknown> = {}) {
  return {
    verify: {
      id: ch.id,
      reason: ch.reason,
      questions: ch.reason === "geo" ? withArea(ch.cities ?? []) : [],
      otp: true,
      phone_masked: maskPhone(phone),
    },
    ...extra,
  };
}

/** Returns null when allowed, or a JSON-able response describing the block/challenge. */
export async function checkGuard(admin: any, id: GuardId, geo: Geo, verification?: any, workspaceOwnerId: string | null = null): Promise<Record<string, unknown> | null> {
  const filter = orFilter(id);
  if (!filter) return null;
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: events } = await admin.from("inquiry_guard_events").select("city, latitude, longitude, created_at").or(filter).gte("created_at", since).order("created_at", { ascending: false }).limit(50);
  const list: Array<{ city: string | null; latitude: number | null; longitude: number | null; created_at: string }> = events ?? [];
  if (list.length >= DAILY_CAP) {
    return { blocked: true, error: `הגעת למכסת ${DAILY_CAP} פניות ביום. אפשר לפנות שוב מחר.` };
  }

  const { data: suspended } = await admin.from("inquiry_guard_challenges").select("id").or(filter).eq("status", "suspended").gte("created_at", since).limit(1);
  if (suspended?.length) return SUSPENDED;

  const { data: cleared } = await admin.from("inquiry_guard_challenges").select("id").or(filter).eq("status", "cleared").gt("cleared_until", new Date().toISOString()).limit(1);
  if (cleared?.length) return null;

  // Determine whether this inquiry needs verification.
  const hourAgo = Date.now() - GEO_WINDOW_MS;
  const recent: Geo[] = list.filter((e) => new Date(e.created_at).getTime() >= hourAgo)
    .map((e) => (e.latitude != null && e.longitude != null ? { city: e.city, lat: e.latitude, lng: e.longitude } : geoOf({ city: e.city })));
  const all = [...recent, geo];
  const cities = new Map<string, string>();
  for (const g of all) if (g.city) cities.set(cityKey(g.city), g.city);
  let maxKm = 0;
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) maxKm = Math.max(maxKm, km(all[i], all[j]));
  const geoFlag = maxKm >= GEO_DISTANCE_KM || cities.size >= GEO_CITY_LIMIT;
  const volumeFlag = list.length >= VOLUME_OTP;
  if (!geoFlag && !volumeFlag) return null;
  if (!id.phone) return { blocked: true, error: "נדרש מספר טלפון תקין לאימות." };

  // Visitor is answering / resending for a pending challenge.
  if (verification?.id) {
    const { data: ch } = await admin.from("inquiry_guard_challenges")
      .select("id, status, attempts, cities, reason, phone, otp_hash, otp_expires_at, otp_attempts, otp_sent_count")
      .eq("id", String(verification.id)).maybeSingle();
    if (ch && ch.status === "pending" && ch.phone === id.phone) {
      if (verification.resend) {
        const sent = await sendOtp(admin, ch, id.phone, workspaceOwnerId);
        return verifyPayload(ch, id.phone, sent.ok ? { sent: true } : { error: sent.error });
      }
      let qOk = true;
      if (ch.reason === "geo") {
        const a = verification.answers ?? {};
        qOk = ["אני מחפש/ת נכס לעצמי", "אני מחפש/ת עבור בן משפחה"].includes(a.goal)
          && typeof a.area === "string" && (ch.cities ?? []).includes(a.area)
          && ["תוך חודש", "תוך 1-3 חודשים", "תוך 3-6 חודשים"].includes(a.timeline);
      }
      const code = String(verification.otp_code ?? "").replace(/\D/g, "");
      const expired = !ch.otp_expires_at || new Date(ch.otp_expires_at).getTime() < Date.now();
      const otpOk = !expired && code.length === 6 && ch.otp_hash === (await sha(`rz-otp:${ch.id}:${code}`));
      if (qOk && otpOk) {
        await admin.from("inquiry_guard_challenges").update({
          status: "cleared", otp_verified_at: new Date().toISOString(), otp_hash: null,
          cleared_until: new Date(Date.now() + CLEAR_MS).toISOString(),
        }).eq("id", ch.id);
        return null;
      }
      const attempts = (ch.attempts ?? 0) + 1;
      await admin.from("inquiry_guard_challenges").update({
        attempts, otp_attempts: (ch.otp_attempts ?? 0) + (otpOk ? 0 : 1),
        status: attempts >= MAX_ATTEMPTS ? "suspended" : "pending",
      }).eq("id", ch.id);
      if (attempts >= MAX_ATTEMPTS) return SUSPENDED;
      const error = !otpOk ? (expired ? "תוקף הקוד פג. בקשו קוד חדש." : "קוד האימות שגוי. נסו שוב.") : "התשובות אינן תואמות פנייה אמיתית. נסו שוב.";
      return verifyPayload(ch, id.phone, { error });
    }
  }

  const reason = geoFlag ? "geo" : "volume";
  const { data: created, error: insErr } = await admin.from("inquiry_guard_challenges")
    .insert({ phone: id.phone, device_id: id.device, ip_hash: id.ip, cities: [...cities.values()], reason })
    .select("id, reason, cities, otp_sent_count").single();
  if (insErr || !created) {
    console.error("[public-lead-gate] challenge insert failed", insErr);
    return { blocked: true, error: "האימות אינו זמין כרגע. נסו שוב מאוחר יותר." };
  }
  console.warn("[public-lead-gate] verification required", { reason, cities: cities.size, max_km: Math.round(maxKm), today: list.length });
  const sent = await sendOtp(admin, created, id.phone, workspaceOwnerId);
  return verifyPayload(created, id.phone, sent.ok ? { sent: true } : { error: sent.error });
}

export async function recordGuard(admin: any, id: GuardId, listingId: string, geo: Geo, action: string) {
  await admin.from("inquiry_guard_events").insert({
    phone: id.phone, device_id: id.device, ip_hash: id.ip, listing_id: listingId,
    city: geo.city, latitude: geo.lat, longitude: geo.lng, action,
  }).then(() => {}, () => {});
}
