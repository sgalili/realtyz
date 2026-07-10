// Pull live data from Homely / Webtiv using the verified production routes
// reverse-engineered from the Homely web app's own network traffic.
//
// Verified routes (all GET unless noted):
//   /api/login/LoginNewByAgent                                   (POST handshake)
//   /api/login/getWorkerList/{hash}/{officeId}
//   /api/wtable/getTblZonesNames
//   /api/report/getInterestingAdminByAgent/{hash}/{officeId}/null/null
//   /api/report/getAgenda/{hash}/null/null
//   /api/report/getSearchSummaries/{hash}
//   /api/report/getRounds/{hash}
//   /api/hashData/getAllKeys/{hash}                              (POST)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const WEBTIV_BASE = "https://webtivapi.webtiv.co.il";
const LOGIN_URL = `${WEBTIV_BASE}/api/login/LoginNewByAgent`;

// Optional proxy gateway (e.g. Cloudflare Worker) to bypass Supabase edge
// runtime egress blocks against the Webtiv firewall. If set, all outbound
// Webtiv URLs are rewritten to `${PROXY}?url=<encoded original url>`.
const WEBTIV_PROXY_URL = Deno.env.get("WEBTIV_PROXY_URL")?.replace(/\/+$/, "") || "";
function proxied(targetUrl: string): string {
  if (!WEBTIV_PROXY_URL) return targetUrl;
  const sep = WEBTIV_PROXY_URL.includes("?") ? "&" : "?";
  return `${WEBTIV_PROXY_URL}${sep}url=${encodeURIComponent(targetUrl)}`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function webtivLogin(agency: string, username: string, password: string) {
  const res = await fetch(proxied(LOGIN_URL), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client: agency, username, password,
      theme: "", version: "realtyz-1.0",
      deviceInfo: { DeviceType: "server", UserAgent: "Realtyz/1.0", Os: "deno", Platform: "edge-function" },
    }),
  });
  const text = await res.text();
  let data: any = null;
  try { data = JSON.parse(text); } catch { /* */ }
  if (!res.ok || !data || data.db === 0 || data.db === "0") {
    return { ok: false as const, status: res.status, note: text.slice(0, 200) };
  }
  return { ok: true as const, session: data };
}

// Walk the login payload and pull the long hex/base64 session hash that the
// Homely web app sends in URL paths (e.g. 5DE65360853C884259501FBFF967FF0B or
// I4ZtypkjAjdz17NVTEGC7A==).
function extractHash(session: any): string | null {
  const direct = session?.hash || session?.Hash || session?.agentHash || session?.AgentHash
    || session?.sessionHash || session?.SessionHash || session?.userHash || session?.UserHash
    || session?.token || session?.Token || session?.accessToken;
  if (direct && typeof direct === "string") return direct;
  // Walk one level deep for nested user/agent objects.
  const nested = [session?.user, session?.User, session?.agent, session?.Agent, session?.data, session?.result];
  for (const n of nested) {
    if (!n || typeof n !== "object") continue;
    const v = n?.hash || n?.Hash || n?.token || n?.Token || n?.agentHash || n?.AgentHash;
    if (v && typeof v === "string") return v;
  }
  // Scan all string values for hex(>=24) or base64-ish ending in ==
  const stack: any[] = [session];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;
    for (const v of Object.values(cur)) {
      if (typeof v === "string") {
        if (/^[A-F0-9]{24,}$/i.test(v)) return v;
        if (/^[A-Za-z0-9+/]{16,}={0,2}$/.test(v) && v.length >= 20 && v.length <= 64) return v;
      } else if (v && typeof v === "object") {
        stack.push(v);
      }
    }
  }
  return null;
}

// The second path slot in getInterestingAdminByAgent is the Worker/Agent ID
// (e.g. 6617303), NOT the office id. Walk the login payload for it; fall back
// to the known-good agent id so the grid still populates while we audit.
function extractAgentId(session: any, fallback = "6617303"): string {
  const KEYS = [
    "agentId", "AgentId", "AgentID", "agent_id",
    "workerId", "WorkerId", "WorkerID", "worker_id",
    "userId", "UserId", "UserID", "user_id",
    "userCode", "UserCode", "id", "Id",
  ];
  const pick = (o: any) => {
    if (!o || typeof o !== "object") return null;
    for (const k of KEYS) {
      const v = o[k];
      if (typeof v === "number" && v > 0) return String(v);
      if (typeof v === "string" && /^\d{4,}$/.test(v)) return v;
    }
    return null;
  };
  const direct = pick(session)
    ?? pick(session?.user) ?? pick(session?.User)
    ?? pick(session?.agent) ?? pick(session?.Agent)
    ?? pick(session?.worker) ?? pick(session?.Worker)
    ?? pick(session?.data) ?? pick(session?.result);
  if (direct) return direct;
  // Deep scan for any numeric id that looks like a worker id (7+ digits).
  const stack: any[] = [session];
  const seen = new Set<any>();
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object" || seen.has(cur)) continue;
    seen.add(cur);
    for (const [k, v] of Object.entries(cur)) {
      if ((typeof v === "number" || typeof v === "string") && /id$/i.test(k)) {
        const s = String(v);
        if (/^\d{6,}$/.test(s)) return s;
      } else if (v && typeof v === "object") stack.push(v);
    }
  }
  return fallback;
}

async function getJson(url: string) {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 20000);
    const r = await fetch(proxied(url), {
      headers: { Accept: "application/json", "User-Agent": "Realtyz/1.0" },
      signal: ctl.signal,
    });
    clearTimeout(t);
    const text = await r.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { /* HTML/IIS error */ }
    return { status: r.status, data, sample: text.slice(0, 200) };
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    console.error("[homely-fetch-property] getJson failed", url, msg);
    return { status: 0, data: null, sample: `fetch_failed: ${msg}`.slice(0, 200), error: msg };
  }
}

async function postJson(url: string, payload: Record<string, unknown>) {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 20000);
    const r = await fetch(proxied(url), {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "Realtyz/1.0" },
      body: JSON.stringify(payload),
      signal: ctl.signal,
    });
    clearTimeout(t);
    const text = await r.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { /* HTML/IIS error */ }
    return { status: r.status, data, sample: text.slice(0, 200) };
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    console.error("[homely-fetch-property] postJson failed", url, msg);
    return { status: 0, data: null, sample: `fetch_failed: ${msg}`.slice(0, 200), error: msg };
  }
}

function asArray(x: any): any[] {
  if (Array.isArray(x)) return x;
  if (!x || typeof x !== "object") return [];
  for (const k of ["result", "data", "items", "list", "rows", "Result", "Data", "Items", "List", "Rows"]) {
    if (Array.isArray(x[k])) return x[k];
  }
  // First array-valued property
  for (const v of Object.values(x)) if (Array.isArray(v)) return v as any[];
  return [];
}

function mapProperty(it: any, idx: number) {
  const id = String(it?.id ?? it?.Id ?? it?.nechesId ?? it?.NechesId ?? it?.propertyId ?? it?.PropertyId
    ?? it?.sidur ?? it?.Sidur ?? it?.serial ?? it?.Serial ?? `row-${idx + 1}`);
  const photo = it?.photo ?? it?.Photo ?? it?.image ?? it?.Image ?? it?.mainImage ?? it?.MainImage
    ?? (Array.isArray(it?.photos) ? it.photos[0] : null)
    ?? (Array.isArray(it?.Photos) ? it.Photos[0] : null);
  return {
    homely_id: id,
    title: String(it?.title ?? it?.Title ?? it?.kotert ?? it?.Kotert ?? it?.name ?? it?.Name ?? ""),
    description: String(it?.description ?? it?.Description ?? it?.tiur ?? it?.Tiur ?? it?.remarks ?? it?.Remarks ?? ""),
    price: Number(it?.price ?? it?.Price ?? it?.mehir ?? it?.Mehir ?? it?.askingPrice ?? it?.AskingPrice ?? 0) || 0,
    city: String(it?.city ?? it?.City ?? it?.ir ?? it?.Ir ?? it?.town ?? ""),
    address: String(it?.address ?? it?.Address ?? it?.ktovet ?? it?.Ktovet ?? it?.street ?? ""),
    rooms: Number(it?.rooms ?? it?.Rooms ?? it?.hadarim ?? it?.Hadarim ?? 0) || 0,
    sqm: Number(it?.sqm ?? it?.Sqm ?? it?.size ?? it?.Size ?? it?.shetach ?? it?.Shetach ?? it?.area ?? 0) || 0,
    floor: Number(it?.floor ?? it?.Floor ?? it?.koma ?? it?.Koma ?? 0) || 0,
    photo: typeof photo === "string" ? photo : null,
    raw: it,
  };
}

function mapContact(it: any, idx: number) {
  const id = String(it?.id ?? it?.Id ?? it?.adamId ?? it?.AdamId ?? it?.contactId ?? it?.ContactId
    ?? it?.leadId ?? it?.LeadId ?? `row-${idx + 1}`);
  const first = it?.firstName ?? it?.FirstName ?? it?.shemPrati ?? "";
  const last = it?.lastName ?? it?.LastName ?? it?.shemMishpacha ?? "";
  const full = (it?.fullName ?? it?.FullName ?? it?.name ?? it?.Name ?? `${first} ${last}`).toString().trim();
  return {
    homely_id: id,
    full_name: full,
    phone: String(it?.phone ?? it?.Phone ?? it?.mobile ?? it?.Mobile ?? it?.cellular ?? it?.Cellular ?? it?.tel ?? ""),
    email: String(it?.email ?? it?.Email ?? it?.mail ?? ""),
    city: String(it?.city ?? it?.City ?? it?.ir ?? ""),
    notes: String(it?.notes ?? it?.Notes ?? it?.remarks ?? it?.Remarks ?? it?.summary ?? ""),
    raw: it,
  };
}

// ---- AutomaionJson stream mappers (verified Webtiv outJson.ashx shape) ----
function firstPhone(it: any): string {
  for (const k of ["tel2", "tel1", "tel3", "tel4", "tel5"]) {
    const v = it?.[k];
    if (v && String(v).replace(/\D/g, "").length >= 7) return String(v);
  }
  return "";
}
function joinName(it: any): string {
  const name = (it?.name ?? "").toString().trim();
  const family = (it?.family ?? "").toString().trim();
  // Hebrew order: first name then family
  return [name, family].filter(Boolean).join(" ").trim();
}
function collectMedia(it: any): { photos: string[]; documents: string[] } {
  const photos = new Set<string>();
  const documents = new Set<string>();
  const toUrl = (v: any): string | null => {
    if (typeof v !== "string") return null;
    const s = v.trim().replace(/\\\//g, "/");
    const embedded = s.match(/https?:\/\/[^\s"'<>]+/i)?.[0];
    if (embedded) return embedded;
    if (/^https?:\/\//i.test(s)) return s;
    if (/^www\./i.test(s)) return `https://${s}`;
    if (/^\/\//.test(s)) return `https:${s}`;
    if (/^\//.test(s) && /\.(jpe?g|png|gif|webp|bmp|heic|pdf|docx?|xlsx?|pptx?|txt|csv|zip)(\?|#|$)/i.test(s)) return `${WEBTIV_BASE}${s}`;
    return null;
  };
  const isImg = (u: string) => /\.(jpe?g|png|gif|webp|bmp|heic)(\?|#|$)/i.test(u);
  const isDoc = (u: string) => /\.(pdf|docx?|xlsx?|pptx?|txt|csv|zip)(\?|#|$)/i.test(u);
  const photoKey = (k: string) => /(pic|photo|image|img|picture|gallery|media|תמונה|תמונות)/i.test(k);
  const docKey = (k: string) => /(file|doc|document|attach|מסמך|מסמכים|קובץ)/i.test(k);
  const sourceLinkKey = (k: string) => /(source|origin|url|link|href|yad2|madlan|מקור|קישור)/i.test(k);
  const push = (v: any, key = "") => {
    const url = toUrl(v);
    if (!url) return;
    if (isImg(url) || photoKey(key)) photos.add(url);
    else if (isDoc(url) || docKey(key)) documents.add(url);
    else if (!sourceLinkKey(key)) photos.add(url); // Homely CDN sometimes omits extensions
  };
  const seen = new Set<any>();
  const walk = (value: any, key = "") => {
    if (value == null) return;
    if (typeof value === "string") { push(value, key); return; }
    if (Array.isArray(value)) { value.forEach((v) => walk(v, key)); return; }
    if (typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    for (const [k, v] of Object.entries(value)) {
      const nextKey = key ? `${key}.${k}` : k;
      if (typeof v === "string") push(v, nextKey);
      else walk(v, nextKey);
    }
  };
  walk(it);
  return { photos: Array.from(photos), documents: Array.from(documents) };
}

function mediaTotal(value: any): number {
  const media = collectMedia(value);
  return media.photos.length + media.documents.length;
}

function firstObjectPayload(data: any): any {
  if (!data) return null;
  if (Array.isArray(data)) return data.find((x) => x && typeof x === "object") ?? data[0] ?? null;
  if (Array.isArray(data?.result)) return firstObjectPayload(data.result);
  if (Array.isArray(data?.data)) return firstObjectPayload(data.data);
  if (data?.result && typeof data.result === "object") return data.result;
  if (data?.data && typeof data.data === "object") return data.data;
  return typeof data === "object" ? data : null;
}

async function fetchRichPropertyDetail(hash: string, serial: string, fallback: any): Promise<{ record: any; endpoint: string | null }> {
  let best = fallback;
  let bestEndpoint: string | null = null;
  const endpoints = [
    `${WEBTIV_BASE}/api/report/getNechesFullDetail/${encodeURIComponent(hash)}/${encodeURIComponent(serial)}`,
    `${WEBTIV_BASE}/api/report/getNechesData/${encodeURIComponent(hash)}/${encodeURIComponent(serial)}`,
    `${WEBTIV_BASE}/api/report/getPropertyDetail/${encodeURIComponent(hash)}/${encodeURIComponent(serial)}`,
  ];
  for (const ep of endpoints) {
    const dr = await getJson(ep);
    if (dr.status < 200 || dr.status >= 300 || !dr.data) continue;
    const candidate = firstObjectPayload(dr.data);
    if (!candidate || typeof candidate !== "object") continue;
    if (mediaTotal(candidate) > mediaTotal(best) || (!pickSourceUrl(best) && pickSourceUrl(candidate))) {
      best = candidate;
      bestEndpoint = ep;
    }
    if (mediaTotal(best) > 0 && pickSourceUrl(best)) break;
  }

  const allKeysEndpoint = `${WEBTIV_BASE}/api/hashData/getAllKeys/${encodeURIComponent(hash)}`;
  for (const payload of [{ id: serial }, { serial }, { sidur: serial }, { nechesId: serial }]) {
    const dr = await postJson(allKeysEndpoint, payload);
    if (dr.status < 200 || dr.status >= 300 || !dr.data) continue;
    const candidate = firstObjectPayload(dr.data);
    if (!candidate || typeof candidate !== "object") continue;
    if (mediaTotal(candidate) > mediaTotal(best) || (!pickSourceUrl(best) && pickSourceUrl(candidate))) {
      best = candidate;
      bestEndpoint = allKeysEndpoint;
    }
    if (mediaTotal(best) > 0 && pickSourceUrl(best)) break;
  }

  return { record: best, endpoint: bestEndpoint };
}
function buildOfficeNotes(it: any): string {
  // Aggregate every broker-side note the office maintains on the property.
  // These are the strings shown in the "הערות משרד" block of Homely and the
  // AI campaign generator must read them verbatim (status, פינוי-בינוי,
  // exclusivity, eviction-reconstruction, agent assignments, etc).
  const parts: string[] = [];
  const push = (label: string, val: unknown) => {
    const s = (val ?? "").toString().trim();
    if (s) parts.push(`${label}: ${s}`);
  };
  push("הערות 1", it?.comments1);
  push("הערות 2", it?.comments2);
  push("הערות נוספות", it?.more);
  push("בלעדיות/סטטוס", it?.exclusive);
  push("פינוי", it?.removal);
  push("מקור", it?.source);
  push("סוכן מטפל", it?.agent);
  push("מכירה", it?.sale_f3);
  return parts.join("\n");
}
// ---- Office filter (mirror of homely-leads ingestion rules) ----
const ALLOWED_AGENT_SUBSTR = "אודי ויטמן";
const ALLOWED_SIVUG_SUBSTRS = ["משרד", "בלעדי"];

function normalizeStreamText(v: unknown): string {
  return String(v ?? "")
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Defensive case-insensitive deep pick: scans every key on the object and
// returns the first non-empty value whose key matches (case-insensitively)
// any of the supplied aliases. Webtiv payloads are inconsistent (PascalCase /
// lower / Hebrew), so this is the only safe way.
function deepPickText(obj: any, aliases: string[]): string {
  if (!obj || typeof obj !== "object") return "";
  const lowered = aliases.map((a) => a.toLowerCase());
  for (const [k, v] of Object.entries(obj)) {
    if (lowered.includes(k.toLowerCase())) {
      const s = normalizeStreamText(v);
      if (s) return s;
    }
  }
  return "";
}

function firstStreamText(it: any, keys: string[]): string {
  return deepPickText(it, keys);
}

function pickAgentName(it: any): string {
  return deepPickText(it, [
    "agent", "agentname", "agent_name", "brokername", "broker_name", "broker",
    "user", "workername", "worker_name", "send_by", "shiuh", "סוכן",
  ]);
}
function pickSivugName(it: any): string {
  return deepPickText(it, [
    "exclusive", "statusname", "status_name", "status",
    "officeallocation", "office_allocation", "allocation",
    "sivug", "shiuh", "shiyuh", "shiyukh", "shiuch",
    "belongto", "belong", "affiliation", "שיוך",
  ]);
}
// Per-stream filter rules:
//   • sale  → affiliation must include 'משרד' or 'בלעדי' (ANY office agent).
//   • rent  → agent must include 'אודי ויטמן'.
function normalizeTxType(it: any): "sale" | "rent" | "unknown" {
  // Numeric code first (1=sale, 2=rent) via case-insensitive deep pick.
  const numericRaw = deepPickText(it, ["transaction_type", "transactiontype", "deal_type", "dealtype", "type", "סוג_עסקה"]);
  const n = Number(numericRaw);
  if (Number.isFinite(n)) {
    if (n === 2) return "rent";
    if (n === 1) return "sale";
  }
  const fields = [
    deepPickText(it, ["transaction_type", "transactiontype", "deal_type", "dealtype", "type", "salerent", "sale_rent", "status", "statusname", "סוג_עסקה"]),
    normalizeStreamText(it?.objectresidence),
    normalizeStreamText(it?.sale_f3),
    deepPickText(it, ["property_status", "propstatus", "transaction", "asset_status", "neches_status", "status_text"]),
    normalizeStreamText(it?.more),
    normalizeStreamText(it?.comments1),
    normalizeStreamText(it?.comments2),
    normalizeStreamText(it?.exclusive),
  ];
  const hay = fields.join(" ").toLowerCase();
  if (/להשכרה|השכרה|שכירות|להשכיר|\brent\b|\brental\b/i.test(hay)) return "rent";
  if (/למכירה|מכירה|למכור|\bsale\b|\bsell\b/i.test(hay)) return "sale";
  return "unknown";
}
function looksLikeRental(it: any): boolean {
  return normalizeTxType(it) === "rent";
}
function passesOfficeFilter(it: any, source: "sellers" | "buyers"): boolean {
  if (source === "sellers") {
    const tx = normalizeTxType(it);
    if (tx === "rent") return pickAgentName(it).toLowerCase().includes(ALLOWED_AGENT_SUBSTR.toLowerCase());
    const aff = pickSivugName(it);
    return ALLOWED_SIVUG_SUBSTRS.some((s) => aff.includes(s));
  }
  // buyers / renter-seekers — loose case-insensitive agent check.
  return pickAgentName(it).toLowerCase().includes(ALLOWED_AGENT_SUBSTR.toLowerCase());
}

function streamFieldAudit(items: any[], limit = 5) {
  return items.slice(0, limit).map((it, index) => ({
    index: index + 1,
    keys: it && typeof it === "object" ? Object.keys(it) : [],
    agent: pickAgentName(it),
    officeAllocation: pickSivugName(it),
    rawAgent: it?.agent ?? it?.Agent ?? it?.AgentName ?? it?.BrokerName ?? null,
    rawExclusive: it?.exclusive ?? it?.Exclusive ?? null,
    rawStatusName: it?.StatusName ?? it?.statusName ?? null,
  }));
}


function pickSourceOrigin(it: any): string {
  const raw = deepPickText(it, [
    "mekor", "source", "sourcename", "source_name", "origin", "provider",
    "publisher", "publishedfrom", "fromsite", "site", "מקור",
  ]).toLowerCase();
  if (!raw) return "";
  if (/yad ?2|יד ?2/.test(raw)) return "yad2";
  if (/madlan|מדלן/.test(raw)) return "madlan";
  if (/fomo|פומו/.test(raw)) return "fomo";
  if (/facebook|פייסבוק/.test(raw)) return "facebook";
  if (/winwin|וינווין/.test(raw)) return "winwin";
  if (/homeless|הומלס/.test(raw)) return "homeless";
  return raw.split(/[\s,;\/]+/)[0] || raw;
}
function pickSourceUrl(it: any): string {
  const aliases = [
    "url", "link", "mekorurl", "sourceurl", "source_url", "externalurl",
    "external_url", "ad_url", "adurl", "linktosource", "yad2url", "yad2_url",
    "link_url", "permalink", "originalurl", "original_url", "publishurl", "publish_url",
    "pageurl", "page_url", "href", "קישור", "קישור_מקור",
  ];
  const direct = deepPickText(it, aliases);
  if (/^https?:\/\//i.test(direct)) return direct;

  const lowered = aliases.map((a) => a.toLowerCase());
  let yad2 = "";
  let fallback = "";
  const seen = new Set<any>();
  const walk = (value: any, key = "") => {
    if (!value || yad2) return;
    if (typeof value === "string") {
      const isCandidateKey = lowered.includes(key.toLowerCase()) || /(url|link|href|קישור)/i.test(key);
      if (isCandidateKey && /^https?:\/\//i.test(value)) {
        if (/yad2\.co\.il/i.test(value)) yad2 = value;
        else if (!fallback) fallback = value;
      }
      return;
    }
    if (Array.isArray(value)) { value.forEach((v) => walk(v, key)); return; }
    if (typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    for (const [k, v] of Object.entries(value)) walk(v, k);
  };
  walk(it);
  return yad2 || fallback;
}
function booleanFeatureFrom(value: unknown): boolean | null {
  const s = normalizeStreamText(value);
  if (!s) return null;
  if (/^(1|true|yes|כן|יש|y)$/i.test(s)) return true;
  if (/^(0|false|no|לא|אין|n)$/i.test(s)) return false;
  const n = Number(s.replace(/[^\d.-]/g, ""));
  if (Number.isFinite(n)) return n > 0;
  if (/מרפסת|balcon/i.test(s)) return true;
  return null;
}
function pickBalcony(it: any): boolean | null {
  const raw = deepPickText(it, [
    "balcony", "balconies", "mirpeset", "mirpesetyn", "mirpesetshemeshyn",
    "balconyyn", "sunbalcony", "sun_balcony", "terrace", "terraceyn",
    "מרפסת", "מרפסת_שמש",
  ]);
  const direct = booleanFeatureFrom(raw);
  if (direct !== null) return direct;
  const hay = [it?.comments1, it?.comments2, it?.more, it?.description, it?.remarks]
    .map(normalizeStreamText)
    .join(" ");
  return /מרפסת|balcony|terrace/i.test(hay) ? true : null;
}
function hasYad2Signal(...values: any[]): boolean {
  return values.some((v) => /yad ?2|יד ?2|yad2\.co\.il/i.test(JSON.stringify(v ?? "")));
}
function pickUpdatedAt(it: any): string {
  const raw = deepPickText(it, [
    "update_date", "updatedate", "updated_at", "updatedat", "update",
    "lastupdate", "last_update", "modifydate", "modify_date", "modified",
    "date_modified", "תאריך_עדכון",
  ]);
  if (!raw) return "";
  // Webtiv often returns "DD/MM/YYYY" or "DD/MM/YYYY HH:mm"
  const m = raw.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const [, d, mo, y, h = "0", mi = "0", s = "0"] = m;
    const year = y.length === 2 ? Number(y) + 2000 : Number(y);
    const iso = new Date(Date.UTC(year, Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s))).toISOString();
    return iso;
  }
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d.toISOString() : "";
}

const YAD2_CITY_CODES: Record<string, { area: string; city: string; path: string }> = {
  "הרצליה": { area: "18", city: "6400", path: "center-and-sharon" },
  "הרצליה ": { area: "18", city: "6400", path: "center-and-sharon" },
  "רמת השרון": { area: "18", city: "2650", path: "center-and-sharon" },
  "תל אביב": { area: "2", city: "5000", path: "tel-aviv" },
  "תל אביב-יפו": { area: "2", city: "5000", path: "tel-aviv" },
  "חיפה": { area: "75", city: "4000", path: "haifa-and-north" },
  "ירושלים": { area: "1", city: "3000", path: "jerusalem" },
  "נתניה": { area: "19", city: "7400", path: "center-and-sharon" },
  "כפר סבא": { area: "18", city: "6900", path: "center-and-sharon" },
  "רעננה": { area: "18", city: "8700", path: "center-and-sharon" },
  "פתח תקווה": { area: "3", city: "7900", path: "petah-tikva-and-rosh-haayin" },
  "ראשון לציון": { area: "5", city: "8300", path: "rishon-lezion-and-ness-ziona" },
  "באר שבע": { area: "7", city: "9000", path: "beer-sheva-and-south" },
};

function yad2CityConfig(city: unknown) {
  const normalized = normalizeStreamText(city).replace(/\s+/g, " ").trim();
  return YAD2_CITY_CODES[normalized] ?? null;
}

function buildYad2FallbackUrl(city: unknown, address: unknown, tx: unknown = "sale", serial: unknown = ""): string {
  const segment = tx === "rent" ? "rent" : "forsale";
  const cfg = yad2CityConfig(city);
  const text = [city, address].map((v) => String(v ?? "").trim()).filter(Boolean).join(" ");
  const path = cfg ? `/realestate/${segment}/${cfg.path}` : `/realestate/${segment}`;
  const url = new URL(`https://www.yad2.co.il${path}`);
  if (cfg) {
    url.searchParams.set("area", cfg.area);
    url.searchParams.set("city", cfg.city);
  }
  if (text) url.searchParams.set("text", text);
  url.searchParams.set("utm_source", "realtyz");
  if (serial) url.searchParams.set("utm_content", String(serial));
  return url.toString();
}

function mapStreamProperty(it: any, idx: number) {
  const serial = String(it?.serial ?? it?.Serial ?? `row-${idx + 1}`);
  const street = [it?.street, it?.number, it?.flatnumber].filter((v) => v && String(v).trim()).join(" ").trim();
  const owner = joinName(it);
  const title = [it?.objectresidence || "נכס", it?.city, street].filter(Boolean).join(" · ").trim();
  const office_notes = buildOfficeNotes(it);
  const notes = [owner ? `בעלים: ${owner}` : "", office_notes].filter(Boolean).join("\n");
  const media = collectMedia(it);
  const sourceOrigin = pickSourceOrigin(it);
  const sourceUrl = pickSourceUrl(it);
  const sourceUpdatedAt = pickUpdatedAt(it);
  const balcony = pickBalcony(it);
  const elevator = deepPickText(it, ["elevator", "lift", "maalit", "מעלית"]);
  const description = deepPickText(it, ["description", "tiur", "remarks", "comments1", "comments2", "more", "תיאור", "הערות"]);
  return {
    homely_id: serial,
    title: title || `נכס ${serial}`,
    description: description || notes,
    office_notes,

    price: Number(it?.priceshekel ?? 0) || 0,
    city: String(it?.city ?? ""),
    address: street,
    rooms: Number(it?.room ?? 0) || 0,
    sqm: Number(it?.builtsqmr ?? 0) || 0,
    floor: Number(it?.floor ?? 0) || 0,
    photo: media.photos[0] ?? null,
    photos: media.photos,
    documents: media.documents,
    property_type: String(it?.objectresidence ?? ""),
    transaction_type: (normalizeTxType(it) === "rent" ? "rent" : "sale") as "sale" | "rent",
    agent: pickAgentName(it),
    sivug: pickSivugName(it),
    source_origin: sourceOrigin,
    source_url: sourceUrl,
    source_updated_at: sourceUpdatedAt,
    balcony,
    elevator,
    raw: it,
  };
}
function mapStreamContact(it: any, idx: number) {
  const serial = String(it?.serial ?? it?.Serial ?? `row-${idx + 1}`);
  const wants = [
    it?.objectresidence,
    it?.room ? `${it.room}${it?.room_max && it.room_max !== it.room ? `-${it.room_max}` : ""} חד׳` : "",
    it?.priceshekel ? `₪${Number(it.priceshekel).toLocaleString("he-IL")}${it?.priceshekel_max ? `-${Number(it.priceshekel_max).toLocaleString("he-IL")}` : ""}` : "",
  ].filter(Boolean).join(" · ");
  return {
    homely_id: serial,
    full_name: joinName(it) || `איש קשר ${serial}`,
    phone: firstPhone(it),
    email: String(it?.email ?? ""),
    city: String(it?.city1 ?? it?.city ?? ""),
    notes: [wants, it?.comments1].filter(Boolean).join("\n"),
    agent: pickAgentName(it),
    sivug: pickSivugName(it),
    raw: it,
  };
}


function normalizeIlPhone(raw: unknown): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  return digits;
}

function compactRaw(raw: unknown) {
  if (!raw || typeof raw !== "object") return raw ?? null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === null || v === undefined || v === "") continue;
    if (typeof v === "string" && v.length > 1000) out[k] = v.slice(0, 1000);
    else out[k] = v;
  }
  return out;
}

function slugify(s: string): string {
  return (s || "homely")
    .toLowerCase()
    .replace(/[^\w\u0590-\u05FF]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "homely";
}

// ─── Media mirror helpers ──────────────────────────────────────────────
// Downloads remote Homely/Webtiv media once and stashes it in the
// `homely-media` Storage bucket, then returns a long-lived signed URL so
// the CRM can render images/docs instantly without re-hitting Homely.
async function sha1Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function extFromUrlOrType(url: string, contentType: string | null): string {
  const m = url.match(/\.([a-z0-9]{2,5})(?:\?|#|$)/i);
  if (m) return m[1].toLowerCase();
  const ct = (contentType || "").toLowerCase();
  if (ct.includes("jpeg")) return "jpg";
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  if (ct.includes("pdf")) return "pdf";
  if (ct.includes("msword")) return "doc";
  if (ct.includes("officedocument.wordprocessingml")) return "docx";
  return "bin";
}

function looksLikeImageBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  // jpg / png / gif / webp / bmp / heic-ish ftyp
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return true;
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return true;
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return true;
  const ascii = new TextDecoder().decode(bytes.slice(0, 32));
  return /RIFF.{4}WEBP|ftyp(heic|heix|mif1|msf1)/i.test(ascii);
}

async function mirrorOne(
  admin: ReturnType<typeof createClient>,
  listingId: string,
  originalUrl: string,
  expected: "image" | "document" | "any" = "any",
): Promise<string | null> {
  try {
    if (!/^https?:\/\//i.test(originalUrl)) return originalUrl || null;
    // Already mirrored? → return as-is.
    if (originalUrl.includes("/storage/v1/object/") && originalUrl.includes("/homely-media/")) {
      return originalUrl;
    }
    const key = await sha1Hex(originalUrl);
    // Fetch once
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 10000);
    let resp: Response;
    try {
      resp = await fetch(proxied(originalUrl), {
        headers: { "User-Agent": "Realtyz/1.0", Accept: "*/*" },
        signal: ctl.signal,
      });
    } finally { clearTimeout(t); }
    if (!resp.ok) return null;
    const contentType = resp.headers.get("content-type") || "application/octet-stream";
    const lowerContentType = contentType.toLowerCase();
    if (/text\/html|application\/json|text\/plain/i.test(lowerContentType)) return null;
    const ext = extFromUrlOrType(originalUrl, contentType);
    const path = `listing/${listingId}/${key}.${ext}`;
    const bytes = new Uint8Array(await resp.arrayBuffer());
    if (expected === "image" && !lowerContentType.startsWith("image/") && !looksLikeImageBytes(bytes)) {
      return null;
    }
    if (expected === "image" && bytes.byteLength < 64) return null;
    // Upload (idempotent — upsert)
    const { error: upErr } = await admin.storage
      .from("homely-media")
      .upload(path, bytes, { contentType, upsert: true, cacheControl: "31536000" });
    if (upErr && !/exists/i.test(upErr.message)) {
      console.error("[mirrorOne] upload failed", upErr.message, path);
      return expected === "image" ? originalUrl : null;
    }
    // 10-year signed URL for embedding in DB
    const { data: signed, error: signErr } = await admin.storage
      .from("homely-media")
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
    if (signErr || !signed?.signedUrl) {
      console.error("[mirrorOne] sign failed", signErr?.message, path);
      return expected === "image" ? originalUrl : null;
    }
    return signed.signedUrl;
  } catch (e) {
    console.error("[mirrorOne] err", (e as Error).message, originalUrl.slice(0, 120));
    return null;
  }
}

async function mirrorAll(
  admin: ReturnType<typeof createClient>,
  listingId: string,
  urls: string[],
  cap: number,
  expected: "image" | "document" | "any" = "any",
): Promise<string[]> {
  const uniq = Array.from(new Set((urls || []).filter((u) => typeof u === "string" && u))).slice(0, cap);
  const out: string[] = [];
  for (const u of uniq) {
    const mirrored = await mirrorOne(admin, listingId, u, expected);
    if (mirrored) out.push(mirrored);
  }
  return out;
}

function normForMatch(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, " ")
    .replace(/[^\w\u0590-\u05FF]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function collectYad2Photos(it: any): string[] {
  const out = new Set<string>();
  const seen = new Set<any>();
  const push = (v: any, key = "") => {
    if (!v) return;
    if (typeof v === "string") {
      const url = v.match(/https?:\/\/[^\s"'<>]+/i)?.[0] ?? (/^\/\//.test(v) ? `https:${v}` : "");
      if (url && (/(image|img|photo|pic|media|cover|gallery|src|url)/i.test(key) || /\.(jpe?g|png|webp|gif)(\?|#|$)/i.test(url))) out.add(url);
      return;
    }
    if (Array.isArray(v)) { v.forEach((x) => push(x, key)); return; }
    if (typeof v !== "object" || seen.has(v)) return;
    seen.add(v);
    for (const [k, val] of Object.entries(v)) push(val, k);
  };
  push(it);
  return Array.from(out);
}

function yad2UrlFromItem(it: any): string {
  const direct = it?.link_url ?? it?.linkUrl ?? it?.url ?? it?.permalink;
  if (typeof direct === "string" && /^https?:\/\//i.test(direct)) return direct;
  const id = it?.id ?? it?.orderId ?? it?.itemId;
  return id ? `https://www.yad2.co.il/realestate/item/${id}` : "";
}

async function enrichFromYad2(
  admin: ReturnType<typeof createClient>,
  ownerId: string,
  property: any,
): Promise<{ photos: string[]; url: string; exact?: boolean } | null> {
  try {
    const city = String(property?.city ?? "").trim();
    const address = String(property?.address || [property?.raw?.street, property?.raw?.number].filter(Boolean).join(" ")).trim();
    const fallbackUrl = buildYad2FallbackUrl(city, address, property?.transaction_type, property?.homely_id ?? property?.external_id ?? property?.raw?.serial ?? "");
    const { data: key } = await admin
      .from("user_api_keys")
      .select("yad2_api_key")
      .eq("user_id", ownerId)
      .maybeSingle();
    const apiKey = String((key as any)?.yad2_api_key ?? "").trim();
    if (!city && !address) return null;
    if (!apiKey || apiKey === "test_pending") return fallbackUrl ? { photos: [], url: fallbackUrl, exact: false } : null;
    const normalizedAddress = normForMatch(address);
    const tx = property?.transaction_type === "rent" ? "rent" : "forsale";
    const cityCfg = yad2CityConfig(city);
    const url = new URL(`https://gw.yad2.co.il/realestate-feed/${tx}/map`);
    if (cityCfg) {
      url.searchParams.set("region", cityCfg.area);
      url.searchParams.set("area", cityCfg.area);
      url.searchParams.set("city", cityCfg.city);
    } else if (city) {
      url.searchParams.set("region", "18");
      url.searchParams.set("city", city);
    }
    if (property?.price) {
      const price = Number(property.price);
      if (Number.isFinite(price) && price > 0) {
        url.searchParams.set("price", `${Math.max(0, Math.round(price * 0.85))}-${Math.round(price * 1.15)}`);
      }
    }
    if (property?.rooms) url.searchParams.set("rooms", `${property.rooms}-${property.rooms}`);
    const upstream = await fetch(url.toString(), { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } });
    if (!upstream.ok) return null;
    const contentType = upstream.headers.get("content-type") || "";
    if (!/json/i.test(contentType)) return null;
    const payload = await upstream.json().catch(() => null);
    const items: any[] = Array.isArray(payload) ? payload : payload?.data?.markers || payload?.data?.items || payload?.feed?.feed_items || payload?.results || [];
    let best: any = null;
    let bestScore = 0;
    for (const it of items) {
      const itemAddress = normForMatch(it?.address?.text || it?.street || it?.title || it?.merchandise?.title);
      const itemCity = normForMatch(it?.city || it?.address?.city?.text);
      let score = 0;
      if (city && itemCity.includes(normForMatch(city))) score += 2;
      if (normalizedAddress && (itemAddress.includes(normalizedAddress) || normalizedAddress.includes(itemAddress))) score += 5;
      if (property?.rooms && Number(it?.rooms ?? it?.additionalDetails?.roomsCount) === Number(property.rooms)) score += 1;
      if (score > bestScore) { best = it; bestScore = score; }
    }
    if (!best || bestScore < 4) return fallbackUrl ? { photos: [], url: fallbackUrl, exact: false } : null;
    const photos = collectYad2Photos(best);
    const itemUrl = yad2UrlFromItem(best);
    return photos.length || itemUrl ? { photos, url: itemUrl || fallbackUrl, exact: true } : (fallbackUrl ? { photos: [], url: fallbackUrl, exact: false } : null);
  } catch (e) {
    console.warn("[homely-fetch] yad2 enrichment failed", (e as Error).message);
    const city = String(property?.city ?? "").trim();
    const address = String(property?.address || [property?.raw?.street, property?.raw?.number].filter(Boolean).join(" ")).trim();
    const fallbackUrl = buildYad2FallbackUrl(city, address, property?.transaction_type, property?.homely_id ?? property?.external_id ?? property?.raw?.serial ?? "");
    return fallbackUrl ? { photos: [], url: fallbackUrl, exact: false } : null;
  }
}

async function campaignMediaFallback(
  admin: ReturnType<typeof createClient>,
  ownerId: string,
  property: any,
): Promise<string[]> {
  try {
    const city = normForMatch(property?.city);
    const address = normForMatch(property?.address || [property?.raw?.street, property?.raw?.number].filter(Boolean).join(" "));
    const price = Number(property?.price ?? property?.asking_price ?? 0) || 0;
    if (!city && !address && !price) return [];
    const { data: rows } = await admin
      .from("campaign_logs")
      .select("message_body, provider_response")
      .eq("user_id", ownerId)
      .eq("channel", "facebook")
      .eq("is_archived", false)
      .order("created_at", { ascending: false })
      .limit(80);
    const collect = (root: any): string[] => {
      const out = new Set<string>();
      const seen = new Set<any>();
      const push = (value: unknown) => {
        if (typeof value !== "string") return;
        const url = value.match(/https?:\/\/[^\s"'<>]+/i)?.[0] ?? "";
        if (/^https?:\/\//i.test(url) && /(fbcdn|scontent|image|photo|jpg|jpeg|png|webp)/i.test(url)) out.add(url);
      };
      const walk = (node: any, key = "") => {
        if (node == null || seen.has(node)) return;
        if (typeof node === "string") { if (/(media|image|photo|picture|url)/i.test(key) || /fbcdn|scontent/i.test(node)) push(node); return; }
        if (Array.isArray(node)) { node.forEach((v) => walk(v, key)); return; }
        if (typeof node !== "object") return;
        seen.add(node);
        for (const [k, v] of Object.entries(node)) walk(v, k);
      };
      walk(root);
      return Array.from(out);
    };
    let best: { score: number; urls: string[] } | null = null;
    for (const row of rows ?? []) {
      const body = normForMatch((row as any)?.message_body);
      let score = 0;
      if (address && body.includes(address)) score += 100;
      if (city && body.includes(city)) score += 10;
      if (price && body.includes(String(Math.round(price)).replace(/\B(?=(\d{3})+(?!\d))/g, " ").trim())) score += 20;
      if (price && body.includes(String(Math.round(price)))) score += 20;
      const urls = collect((row as any)?.provider_response);
      if (score > 0 && urls.length && (!best || score > best.score)) best = { score, urls };
    }
    return best?.score ? best.urls : [];
  } catch (e) {
    console.warn("[homely-fetch] campaign media fallback failed", (e as Error).message);
    return [];
  }
}

async function resolveWorkspaceOwnerId(admin: ReturnType<typeof createClient>, userId: string): Promise<string> {
  const { data: profile } = await admin
    .from("profiles")
    .select("active_workspace_owner_id, workspace_owner_id")
    .eq("id", userId)
    .maybeSingle();
  const active = String((profile as any)?.active_workspace_owner_id ?? "").trim();
  const fallback = String((profile as any)?.workspace_owner_id ?? "").trim() || userId;
  const owner = active || fallback;
  if (owner === userId) return owner;
  const { data: membership } = await admin
    .from("workspace_memberships")
    .select("id")
    .eq("user_id", userId)
    .eq("workspace_owner_id", owner)
    .maybeSingle();
  return membership ? owner : fallback;
}

async function configuredHomelyFeedUrl(admin: ReturnType<typeof createClient>, ownerId: string): Promise<string> {
  const { data } = await admin
    .from("homely_broker_credentials")
    .select("homely_feed_url")
    .eq("user_id", ownerId)
    .maybeSingle();
  const raw = String((data as any)?.homely_feed_url ?? "").trim();
  return /^https?:\/\//i.test(raw) ? raw : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const workspaceOwnerId = await resolveWorkspaceOwnerId(admin, user.id);
    const body = await req.json().catch(() => ({}));
    const action = (body as any)?.action as string | undefined;
    const listing_id = (body as any)?.listing_id;

    if (action === "importOutJson") {
      const propertyIds = new Set(((body as any)?.propertyIds ?? []).map((v: unknown) => String(v)));
      const contactIds = new Set(((body as any)?.contactIds ?? []).map((v: unknown) => String(v)));
      let properties = Array.isArray((body as any)?.properties) ? (body as any).properties : [];
      let contacts = Array.isArray((body as any)?.contacts) ? (body as any).contacts : [];
      const SELLERS_GUID = Deno.env.get("HOMELY_SELLERS_GUID") || "32dc79a4-88ba-49a4-816e-f1fc43024c2f";
      const BUYERS_GUID  = Deno.env.get("HOMELY_BUYERS_GUID")  || "b6bb7f44-571b-4551-8de9-e075b8a89128";
      const customPropertiesFeedUrl = await configuredHomelyFeedUrl(admin, workspaceOwnerId);
      if (propertyIds.size && properties.length === 0) {
        const r = await getJson(customPropertiesFeedUrl || `${WEBTIV_BASE}/AutomaionJson/outJson.ashx?guid=${SELLERS_GUID}`);
        if (r.status < 200 || r.status >= 300) throw new Error(`properties_stream_http_${r.status}`);
        properties = asArray(r.data).map(mapStreamProperty).filter((p) => propertyIds.has(String(p.homely_id)));
      }
      if (contactIds.size && contacts.length === 0) {
        const r = await getJson(`${WEBTIV_BASE}/AutomaionJson/outJson.ashx?guid=${BUYERS_GUID}`);
        if (r.status < 200 || r.status >= 300) throw new Error(`contacts_stream_http_${r.status}`);
        contacts = asArray(r.data).map(mapStreamContact).filter((c) => contactIds.has(String(c.homely_id)));
      }
      let propsCount = 0;
      let contactsCount = 0;
      let richHash: string | null = null;
      if (properties.length > 0) {
        try {
          const { data: cred } = await admin
            .from("homely_broker_credentials")
            .select("homely_agency, homely_username")
            .eq("user_id", workspaceOwnerId)
            .maybeSingle();
          const { data: pw } = await admin.rpc("get_homely_password", { _user_id: workspaceOwnerId });
          if (cred?.homely_agency && cred?.homely_username && pw) {
            const login = await webtivLogin(String(cred.homely_agency), String(cred.homely_username), pw as unknown as string);
            if (login.ok) richHash = extractHash(login.session);
          }
        } catch (e) {
          console.warn("[importOutJson] rich detail login skipped", (e as Error).message);
        }
      }

      for (const p of properties) {
        const homelyId = String(p?.homely_id ?? "").trim();
        if (!homelyId) continue;
        let richRecord = p?.raw ?? p;
        let richEndpoint: string | null = null;
        if (richHash) {
          try {
            const rich = await fetchRichPropertyDetail(richHash, homelyId, richRecord);
            richRecord = rich.record ?? richRecord;
            richEndpoint = rich.endpoint;
          } catch (e) {
            console.warn(`[importOutJson] rich detail skipped for ${homelyId}`, (e as Error).message);
          }
        }
        const richMedia = collectMedia(richRecord);
        const rawSourceOrigin = pickSourceOrigin(richRecord) || p?.source_origin || null;
        const sourceIsYad2 = rawSourceOrigin === "yad2" || hasYad2Signal(richRecord, p?.raw, p?.source_url, rawSourceOrigin);
        const shouldProbeYad2 = sourceIsYad2 || (!p?.source_url && p?.transaction_type === "sale");
        const yad2Enrichment = shouldProbeYad2 ? await enrichFromYad2(admin, workspaceOwnerId, p) : null;
        const richSourceOrigin = sourceIsYad2 || yad2Enrichment?.exact ? "yad2" : rawSourceOrigin;
        const balcony = pickBalcony(richRecord) ?? booleanFeatureFrom(p?.balcony);
        const campaignPhotos = richMedia.photos.length || (Array.isArray(p?.photos) && p.photos.length) || p?.photo
          ? []
          : await campaignMediaFallback(admin, workspaceOwnerId, p);
        const rawPhotos = richMedia.photos.length
          ? richMedia.photos
          : (Array.isArray(p?.photos) && p.photos.length ? p.photos : (p?.photo ? [p.photo] : (yad2Enrichment?.photos?.length ? yad2Enrichment.photos : campaignPhotos)));
        const rawDocuments = richMedia.documents.length ? richMedia.documents : (Array.isArray(p?.documents) ? p.documents : []);
        const richSourceUrl = pickSourceUrl(richRecord)
          || yad2Enrichment?.url
          || (p?.source_url ? String(p.source_url) : "")
          || (richSourceOrigin === "yad2" ? buildYad2FallbackUrl(p?.city, p?.address, p?.transaction_type, homelyId) : "");
        const features = Array.from(new Set([
          ...(Array.isArray(p?.features) ? p.features.filter((f: any) => typeof f === "string") : []),
          ...(balcony === true ? ["מרפסת"] : []),
        ]));
        const row: Record<string, unknown> = {
          user_id: workspaceOwnerId,
          slug: `${slugify(String(p?.title || p?.address || "homely"))}-${homelyId}`,
          source: "homely",
          source_url: richSourceUrl || null,
          external_id: homelyId,
          property_title: String(p?.title || p?.address || `נכס ${homelyId}`),
          description: String(p?.description || ""),
          asking_price: Number(p?.price) || 0,
          city: p?.city ? String(p.city) : null,
          address: p?.address ? String(p.address) : null,
          rooms: Number(p?.rooms) || null,
          sqm: Number.isFinite(Number(p?.sqm)) ? Number(p.sqm) : null,
          floor: Number.isFinite(Number(p?.floor)) ? Number(p.floor) : null,
          status: "live",
          is_published: true,
          office_notes: p?.office_notes ? String(p.office_notes) : null,
          features,
          media_photos: rawPhotos,
          media_documents: rawDocuments,
          source_metadata: {
            homely_id: homelyId,
            property_type: p?.property_type || null,
            photos: rawPhotos,
            documents: rawDocuments,
            media_count: rawPhotos.length + rawDocuments.length,
            office_notes: p?.office_notes || null,
            agent: p?.agent || null,
            source_origin: richSourceOrigin,
            yad2_search_url: !yad2Enrichment?.exact && yad2Enrichment?.url ? yad2Enrichment.url : null,
            yad2_exact_match: yad2Enrichment?.exact ?? null,
            source_url: richSourceUrl || null,
            source_updated_at: p?.source_updated_at || null,
            balcony,
            elevator: p?.elevator || null,
            transaction_type: p?.transaction_type || null,
            homely_raw: compactRaw(richRecord),
            detail_endpoint: richEndpoint,
            synced_at: new Date().toISOString(),
          },
        };
        if (p?.source_updated_at) row.updated_at = p.source_updated_at;
        let upserted: any = null;
        const { data: existingByExternal } = await admin
          .from("listings")
          .select("id")
          .eq("source", "homely")
          .eq("external_id", homelyId)
          .maybeSingle();
        if (existingByExternal?.id) {
          const { data: updatedExisting, error } = await admin
            .from("listings")
            .update(row as any)
            .eq("id", existingByExternal.id)
            .select("id")
            .single();
          if (error) throw new Error(`listings#${homelyId}: ${error.message}`);
          upserted = updatedExisting;
        } else {
          const { data: inserted, error } = await admin
            .from("listings")
            .insert(row as any)
            .select("id")
            .single();
          if (error && richSourceUrl) {
            const { data: existingByUrl } = await admin
              .from("listings")
              .select("id")
              .eq("source_url", richSourceUrl)
              .maybeSingle();
            if (existingByUrl?.id) {
              const { data: updatedByUrl, error: updateByUrlErr } = await admin
                .from("listings")
                .update(row as any)
                .eq("id", existingByUrl.id)
                .select("id")
                .single();
              if (updateByUrlErr) throw new Error(`listings#${homelyId}: ${updateByUrlErr.message}`);
              upserted = updatedByUrl;
            } else {
              throw new Error(`listings#${homelyId}: ${error.message}`);
            }
          } else if (error) {
            throw new Error(`listings#${homelyId}: ${error.message}`);
          } else {
            upserted = inserted;
          }
        }
        propsCount++;

        // Mirror media into homely-media bucket so images render instantly
        // and Homely's CDN is only hit once per file.
        try {
          const listingId = String((upserted as any)?.id ?? "");
          if (listingId) {
            const mirroredPhotos = await mirrorAll(admin, listingId, rawPhotos, 40);
            const mirroredDocs = await mirrorAll(admin, listingId, rawDocuments, 20);
            if (mirroredPhotos.length || mirroredDocs.length) {
              const meta = row.source_metadata as Record<string, unknown>;
              await admin.from("listings").update({
                media_photos: mirroredPhotos.length ? mirroredPhotos : rawPhotos,
                media_documents: mirroredDocs.length ? mirroredDocs : rawDocuments,
                source_metadata: {
                  ...meta,
                  photos: mirroredPhotos.length ? mirroredPhotos : rawPhotos,
                  documents: mirroredDocs.length ? mirroredDocs : rawDocuments,
                  photos_original: rawPhotos,
                  documents_original: rawDocuments,
                  media_mirrored_at: new Date().toISOString(),
                },
              }).eq("id", listingId);
            }
          }
        } catch (mirrorErr) {
          console.error(`[importOutJson] mirror failed for ${homelyId}:`, (mirrorErr as Error).message);
        }
      }

      for (const c of contacts) {
        const homelyId = String(c?.homely_id ?? "").trim();
        const phone = normalizeIlPhone(c?.phone);
        // Hard skip when there's no real phone — never fall back to the
        // serial/homely_id, that's what produced bogus "16553" rows.
        if (!phone || phone.length < 11) continue;
        const row = {
          phone_number: phone,
          full_name: c?.full_name ? String(c.full_name) : `איש קשר ${homelyId || phone}`,
          city: c?.city ? String(c.city) : null,
          email: c?.email ? String(c.email) : null,
          status: "contacted",
          lead_stage: "qualified",
          deal_type: "sale",
          assigned_to: workspaceOwnerId,
          is_demo: false,
          preferences: {
            homely_id: homelyId || null,
            homely_notes: c?.notes || null,
            source: "homely",
            homely_raw: compactRaw(c?.raw),
            synced_at: new Date().toISOString(),
          },
        };
        const { error } = await admin.from("leads").upsert(row as any, { onConflict: "phone_number" });
        if (error) throw new Error(`leads#${homelyId || phone}: ${error.message}`);
        contactsCount++;
      }

      return json({ ok: true, imported: propsCount + contactsCount, propsCount, contactsCount });
    }

    // ---------- Bulk pull (verified Webtiv AutomaionJson streams) ----------
    // These are the office's outbound JSON exports (one GUID per stream),
    // configured inside Homely by the broker. They are the same arrays the
    // Homely web app uses for the "נכסים" and "אנשי קשר" reports — they
    // always contain real data, unlike the per-agent /api/report/* routes
    // that depend on the agent's personal "interesting" filter.
    if (["fetchAllProperties", "fetchAllContacts", "searchProperties", "searchContacts"].includes(action || "")) {
      const isSearchAction = action === "searchProperties" || action === "searchContacts";
      const filters = ((body as any)?.filters && typeof (body as any).filters === "object") ? (body as any).filters : {};
      const searchText = normalizeStreamText(filters.search).toLowerCase();
      const filterCities = Array.isArray(filters.cities) ? new Set(filters.cities.map((c: unknown) => normalizeStreamText(c)).filter(Boolean)) : new Set<string>();
      const filterRooms = normalizeStreamText(filters.rooms);
      const filterType = normalizeStreamText(filters.type);
      const filterAgent = normalizeStreamText(filters.agent);
      const filterDeal = normalizeStreamText(filters.deal);
      const hasServerFilter = !!(searchText || filterCities.size || filterRooms || filterType || filterAgent || (filterDeal && filterDeal !== "all"));
      if (isSearchAction && !hasServerFilter) {
        return json({ ok: true, source: "AutomaionJson.search", count: 0, rawCount: 0, properties: [], contacts: [], empty: true });
      }
      const SELLERS_GUID = Deno.env.get("HOMELY_SELLERS_GUID") || "32dc79a4-88ba-49a4-816e-f1fc43024c2f";
      const BUYERS_GUID  = Deno.env.get("HOMELY_BUYERS_GUID")  || "b6bb7f44-571b-4551-8de9-e075b8a89128";
      const isPropertiesAction = action === "fetchAllProperties" || action === "searchProperties";
      const guid = isPropertiesAction ? SELLERS_GUID : BUYERS_GUID;
      const customPropertiesFeedUrl = isPropertiesAction ? await configuredHomelyFeedUrl(admin, workspaceOwnerId) : "";
      const url = customPropertiesFeedUrl || `${WEBTIV_BASE}/AutomaionJson/outJson.ashx?guid=${guid}`;

      const r = await getJson(url);
      console.log(`[homely-fetch-property] GET ${url} → ${r.status}, bytes-sample=${r.sample.length}`);
      if (r.status < 200 || r.status >= 300) {
        return json({
          ok: false,
          error: `stream_http_${r.status}`,
          endpoint: url,
          sample: r.sample,
          properties: [],
          contacts: [],
          empty: true,
        }, 200);
      }
      const items = asArray(r.data);
      const debug = [{
        url, status: r.status,
        topKeys: r.data && typeof r.data === "object" && !Array.isArray(r.data) ? Object.keys(r.data).slice(0, 10) : null,
        sampleKeys: items[0] && typeof items[0] === "object" ? Object.keys(items[0]).slice(0, 20) : null,
        count: items.length,
        fieldAudit: streamFieldAudit(items),
      }];
      console.log(`[homely-fetch] ${action} first records field audit:`, JSON.stringify(streamFieldAudit(items)));

      if (isPropertiesAction) {
        const discardedSamples: any[] = [];
        // Per-record rule: include office-owned listings for both sale and rent.
        const finalFilteredProperties = items.filter((item: any) => {
          const affiliation = pickSivugName(item);
          const agent = pickAgentName(item);
          const tx = normalizeTxType(item);
          const sivugOk = ALLOWED_SIVUG_SUBSTRS.some((s) => affiliation.includes(s));
          const agentOk = agent.includes(ALLOWED_AGENT_SUBSTR);
          const ok = sivugOk || agentOk;
          if (!ok && discardedSamples.length < 3) {
            discardedSamples.push({
              rawAgent: item?.agent,
              rawExclusive: item?.exclusive,
              pickedAgent: agent,
              pickedSivug: affiliation,
              tx,
              keys: Object.keys(item || {}),
            });
          }
          return ok;
        });
        if (discardedSamples.length) console.log("[homely-fetch] sellers discarded samples:", JSON.stringify(discardedSamples));
        const properties = finalFilteredProperties.map(mapStreamProperty).filter((p: any) => {
          if (filterDeal && filterDeal !== "all" && p.transaction_type !== filterDeal) return false;
          if (filterCities.size && !filterCities.has(normalizeStreamText(p.city))) return false;
          if (filterType && normalizeStreamText(p.property_type) !== filterType) return false;
          if (filterRooms && Number(p.rooms) !== Number(filterRooms)) return false;
          if (filterAgent && normalizeStreamText(p.agent) !== filterAgent) return false;
          if (searchText) {
            const hay = [p.title, p.city, p.address, p.agent, p.sivug, p.homely_id, p.description, p.property_type]
              .map((v) => normalizeStreamText(v).toLowerCase())
              .join(" ");
            if (!hay.includes(searchText)) return false;
          }
          return true;
        });
        const saleCount = properties.filter((p: any) => p.transaction_type === "sale").length;
        const rentCount = properties.filter((p: any) => p.transaction_type === "rent").length;
        console.log(`[homely-fetch] SERVER FILTER GATE: raw=${items.length} filtered=${finalFilteredProperties.length} sale=${saleCount} rent=${rentCount}`);
        return json({
          ok: true,
          source: isSearchAction ? "AutomaionJson.sellers.search" : "AutomaionJson.sellers",
          endpoint: url,
          count: properties.length,
          saleCount,
          rentCount,
          rawCount: items.length,
          properties,
          empty: properties.length === 0,
          debug,
        });
      }
      const discardedSamples: any[] = [];
      const filtered = items.filter((it: any) => {
        const ok = passesOfficeFilter(it, "buyers");
        if (!ok && discardedSamples.length < 3) {
          discardedSamples.push({ rawAgent: it?.agent, rawExclusive: it?.exclusive, rawSivug: it?.sivug, pickedAgent: pickAgentName(it), pickedSivug: pickSivugName(it), keys: Object.keys(it || {}) });
        }
        return ok;
      });
      if (discardedSamples.length) console.log("[homely-fetch] buyers discarded samples:", JSON.stringify(discardedSamples));
      const contacts = filtered.map(mapStreamContact).filter((c: any) => {
        if (filterCities.size && !filterCities.has(normalizeStreamText(c.city))) return false;
        if (filterAgent && normalizeStreamText(c.agent) !== filterAgent) return false;
        if (searchText) {
          const hay = [c.full_name, c.city, c.phone, c.email, c.agent, c.sivug, c.homely_id, c.notes]
            .map((v) => normalizeStreamText(v).toLowerCase())
            .join(" ");
          if (!hay.includes(searchText)) return false;
        }
        return true;
      });
      return json({
        ok: true,
        source: isSearchAction ? "AutomaionJson.buyers.search" : "AutomaionJson.buyers",
        endpoint: url,
        count: contacts.length,
        rawCount: items.length,
        contacts,
        empty: contacts.length === 0,
        debug,
      });


    }



    // ---------- Single listing refresh (used by Edit dialog) ----------
    if (!listing_id) return json({ error: "listing_id required" }, 400);

    const { data: listing } = await admin
      .from("listings")
      .select("id, user_id, property_title, description, asking_price, city, address, rooms, sqm, floor, features, source_metadata, external_id")
      .eq("id", listing_id)
      .maybeSingle();
    if (!listing) return json({ error: "listing_not_found" }, 404);

    const meta = (listing.source_metadata as any) ?? {};
    const serial = listing.external_id || meta.serial || meta.sidur || meta.extras?.["סדורי"];
    if (!serial) return json({ error: "no_serial_on_listing", hint: "source_metadata.serial missing" }, 400);

    const { data: cred } = await admin
      .from("homely_broker_credentials")
      .select("homely_agency, homely_username")
      .eq("user_id", workspaceOwnerId)
      .maybeSingle();
    if (!cred?.homely_agency || !cred?.homely_username) {
      return json({ ok: false, needs_setup: true, error: "no_homely_credentials" }, 200);
    }
    const { data: pw } = await admin.rpc("get_homely_password", { _user_id: workspaceOwnerId });
    if (!pw) return json({ ok: false, needs_setup: true, error: "no_homely_password" }, 200);

    const login = await webtivLogin(String(cred.homely_agency), String(cred.homely_username), pw as unknown as string);
    if (!login.ok) return json({ error: `login_failed:${login.status}`, note: login.note }, 502);

    const hash = extractHash(login.session);
    if (!hash) return json({ error: "no_hash_in_login" }, 502);
    const agentId = extractAgentId(login.session);

    // Pull the broker's active list and find the matching serial in it.
    const url = `${WEBTIV_BASE}/api/report/getInterestingAdminByAgent/${encodeURIComponent(hash)}/${encodeURIComponent(agentId)}/null/null`;
    const r = await getJson(url);
    const list = asArray(r.data);
    const serialStr = String(serial);
    let detail = list.find((it: any) => {
      const ids = [it?.id, it?.Id, it?.nechesId, it?.NechesId, it?.sidur, it?.Sidur, it?.serial, it?.Serial, it?.propertyId, it?.PropertyId]
        .filter((v) => v !== undefined && v !== null)
        .map(String);
      return ids.includes(serialStr);
    });
    let detailIsStreamShape = false;
    if (!detail) {
      const cachedRaw = meta?.homely_raw && typeof meta.homely_raw === "object" ? meta.homely_raw : null;
      const cachedSerial = cachedRaw ? String(cachedRaw?.serial ?? cachedRaw?.Serial ?? cachedRaw?.sidur ?? cachedRaw?.Sidur ?? "") : "";
      if (cachedRaw && cachedSerial === serialStr) {
        detail = cachedRaw;
        detailIsStreamShape = true;
      }
    }
    if (!detail) {
      const SELLERS_GUID = Deno.env.get("HOMELY_SELLERS_GUID") || "32dc79a4-88ba-49a4-816e-f1fc43024c2f";
      const customPropertiesFeedUrl = await configuredHomelyFeedUrl(admin, workspaceOwnerId);
      const stream = await getJson(customPropertiesFeedUrl || `${WEBTIV_BASE}/AutomaionJson/outJson.ashx?guid=${SELLERS_GUID}`);
      const streamItems = asArray(stream.data);
      detail = streamItems.find((it: any) => String(it?.serial ?? it?.Serial ?? it?.sidur ?? it?.Sidur ?? "") === serialStr) ?? null;
      detailIsStreamShape = !!detail;
    }
    if (!detail) {
      return json({
        ok: false,
        error: "property_not_found_in_broker_list",
        endpoint: url,
        broker_active_count: list.length,
        serial,
      }, 200);
    }

    const mapped = detailIsStreamShape ? mapStreamProperty(detail, 0) : mapProperty(detail, 0);
    const rich = await fetchRichPropertyDetail(hash, serialStr, detail);
    const richest = rich.record ?? detail;
    const media = collectMedia(richest);
    const summaryPhoto = mapped.photo ? [mapped.photo] : [];
    const rawPhotos = media.photos.length ? media.photos : summaryPhoto;
    const rawDocs = media.documents;
    const rawSourceOrigin = pickSourceOrigin(richest) || pickSourceOrigin(detail) || meta.source_origin || null;
    const sourceOriginRaw = rawSourceOrigin === "yad2" || hasYad2Signal(richest, detail, meta.source_url, rawSourceOrigin) ? "yad2" : rawSourceOrigin;
    const mappedForEnrichment = { ...mapped, raw: richest, source_origin: sourceOriginRaw, transaction_type: meta.transaction_type };
    const shouldProbeYad2 = sourceOriginRaw === "yad2" || (!meta.source_url && meta.transaction_type === "sale");
    const yad2Enrichment = shouldProbeYad2 ? await enrichFromYad2(admin, workspaceOwnerId, mappedForEnrichment) : null;
    const sourceOrigin = sourceOriginRaw === "yad2" || yad2Enrichment?.exact ? "yad2" : sourceOriginRaw;
    const balcony = pickBalcony(richest) ?? pickBalcony(detail) ?? booleanFeatureFrom(meta.balcony ?? meta.mirpeset);
    const campaignPhotos = rawPhotos.length ? [] : await campaignMediaFallback(admin, workspaceOwnerId, { ...mapped, price: mapped.price || listing.asking_price, city: mapped.city || listing.city, address: mapped.address || listing.address, raw: richest });
    const finalRawPhotos = rawPhotos.length ? rawPhotos : (yad2Enrichment?.photos?.length ? yad2Enrichment.photos : campaignPhotos);
    const sourceUrl = pickSourceUrl(richest)
      || pickSourceUrl(detail)
      || yad2Enrichment?.url
      || (typeof meta.source_url === "string" ? meta.source_url : "")
      || (sourceOrigin === "yad2" ? buildYad2FallbackUrl(mapped.city || listing.city, mapped.address || listing.address, meta.transaction_type, serialStr) : "");

    // Mirror media once into homely-media bucket and store signed URLs
    const cachedPhotos = await mirrorAll(admin, String(listing_id), finalRawPhotos, 40);
    const cachedDocs = await mirrorAll(admin, String(listing_id), rawDocs, 20);

    const updated = {
      property_title: mapped.title || listing.property_title,
      description: mapped.description || listing.description,
      asking_price: mapped.price || listing.asking_price,
      city: mapped.city || listing.city,
      address: mapped.address || listing.address,
      rooms: mapped.rooms || listing.rooms,
      sqm: mapped.sqm || listing.sqm,
      floor: mapped.floor || listing.floor,
      external_id: String(serial),
      source_url: sourceUrl || null,
      media_photos: cachedPhotos.length ? cachedPhotos : finalRawPhotos,
      media_documents: cachedDocs.length ? cachedDocs : rawDocs,
      features: Array.from(new Set([
        ...(Array.isArray(listing.features) ? listing.features.filter((f: any) => typeof f === "string") : []),
        ...(balcony === true ? ["מרפסת"] : []),
      ])),
      source_metadata: {
        ...meta,
        source_origin: sourceOrigin,
        source_url: sourceUrl || null,
        yad2_search_url: !yad2Enrichment?.exact && yad2Enrichment?.url ? yad2Enrichment.url : null,
        yad2_exact_match: yad2Enrichment?.exact ?? null,
        photos: cachedPhotos.length ? cachedPhotos : finalRawPhotos,
        documents: cachedDocs.length ? cachedDocs : rawDocs,
        photos_origin: finalRawPhotos,
        documents_origin: rawDocs,
        balcony,
        homely_raw: richest,
        synced_at: new Date().toISOString(),
        endpoint: rich.endpoint ?? url,
      },
    };

    const { error: upErr } = await admin.from("listings").update(updated).eq("id", listing_id);
    if (upErr) return json({ error: `db_update_failed:${upErr.message}` }, 500);

    return json({
      ok: true,
      listing_id,
      serial,
      endpoint: url,
      photo_count: cachedPhotos.length,
      document_count: cachedDocs.length,
      raw_photo_count: finalRawPhotos.length,
      raw_document_count: rawDocs.length,
    });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    console.error("[homely-fetch-property] fatal", msg);
    const isNetwork = /No route to host|tcp connect|EHOSTUNREACH|ECONNREFUSED|ETIMEDOUT|network|fetch failed|sending request/i.test(msg);
    if (isNetwork) {
      return json({
        success: false,
        ok: false,
        imported: 0,
        properties: [],
        contacts: [],
        empty: true,
        error: "שגיאת תקשורת זמנית מול שרתי ובטיב. המערכת תנסה להתחבר מחדש באופן אוטומטי בעוד מספר דקות.",
        upstream_error: msg.slice(0, 300),
      }, 200);
    }
    return json({ success: false, error: msg }, 500);
  }
});
