// index.ts
import * as cheerio from "cheerio";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

// policy.ts
function retryDelay(attempt, retryAfterMs = 0) {
  return Math.min(18e4, Math.max(Math.min(12e4, 15e3 * 2 ** Math.max(0, attempt - 1)), retryAfterMs));
}
function configuration(env) {
  const required = ["TORAFF_IMPORT_API_URL", "IMPORT_WORKER_SHARED_SECRET", "BRIGHT_DATA_API_KEY", "BRIGHTDATA_UNLOCKER_ZONE"];
  for (const key of required) if (!env[key]) throw new Error(`Missing ${key}`);
  const url = new URL(env.TORAFF_IMPORT_API_URL ?? "");
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Import API must use HTTPS");
  const integer = (key, fallback, min, max) => {
    const value = Number(env[key] ?? fallback);
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${key} must be ${min}..${max}`);
    return value;
  };
  return {
    api: url.href,
    secret: env.IMPORT_WORKER_SHARED_SECRET ?? "",
    token: env.BRIGHT_DATA_API_KEY ?? "",
    zone: env.BRIGHTDATA_UNLOCKER_ZONE ?? "",
    id: env.IMPORT_WORKER_ID ?? "railway-toraff-1",
    concurrency: integer("WORKER_CONCURRENCY", 4, 1, 5),
    interval: integer("WORKER_REQUEST_INTERVAL_MS", 1e3, 250, 15e3),
    timeout: integer("WORKER_SOURCE_TIMEOUT_MS", 45e3, 1e4, 12e4),
    poll: integer("WORKER_POLL_INTERVAL_MS", 5e3, 1e3, 6e4)
  };
}

// concurrency.ts
var delay = (ms) => new Promise((resolve2) => setTimeout(resolve2, ms));
var RequestGate = class {
  constructor(interval, now = Date.now, wait = delay) {
    this.interval = interval;
    this.now = now;
    this.wait = wait;
  }
  next = 0;
  cooldown = 0;
  defer(ms) {
    this.cooldown = Math.max(this.cooldown, this.now() + ms);
  }
  async enter() {
    const slot = Math.max(this.now(), this.next, this.cooldown);
    this.next = slot + this.interval;
    await this.wait(Math.max(0, slot - this.now()));
    if (slot < this.cooldown) await this.enter();
  }
};
async function readAndCommit(items, read, commit) {
  let chain = Promise.resolve();
  let commitFailed = false;
  const results = await Promise.allSettled(items.map(async (url) => {
    const value = await read(url);
    const save = chain.then(async () => {
      if (commitFailed) throw new Error("Earlier checkpoint save failed");
      try {
        await commit(url, value);
      } catch (error) {
        commitFailed = true;
        throw error;
      }
    });
    chain = save.catch(() => {
    });
    await save;
  }));
  const failures = results.filter((r) => r.status === "rejected");
  const suspended = failures.find((r) => r.reason?.status === 407);
  if (suspended) throw suspended.reason;
  if (failures.length) throw failures[0].reason;
}

// ../supabase/functions/_shared/brokerBatchImport.ts
function batchPhone(v) {
  const d = String(v ?? "").replace(/\D/g, "");
  if (/^05\d{8}$/.test(d)) return `972${d.slice(1)}`;
  return /^9725\d{8}$/.test(d) ? d : null;
}
function batchListingUrls(urls) {
  const out = /* @__PURE__ */ new Set();
  for (const u of urls) {
    try {
      const x = new URL(u.trim());
      const id = x.pathname.match(/\/realestate\/item\/(?:[a-z0-9-]+\/)?([a-z0-9_-]+)\/?$/i)?.[1];
      if (x.protocol === "https:" && /(^|\.)yad2\.co\.il$/i.test(x.hostname) && id) out.add(`https://www.yad2.co.il/realestate/item/${id.toLowerCase()}`);
    } catch {
    }
  }
  return [...out].slice(0, 10);
}

// ../supabase/functions/_shared/yad2Agencies.ts
var AGENCIES_URL = "https://www.yad2.co.il/realestate/agencies";
var AGENCY_REGISTRY_TTL_MS = 7 * 864e5;
function agencyListingCount(value) {
  if (typeof value === "number") return Number.isInteger(value) && value >= 0 ? value : null;
  if (typeof value !== "string") return null;
  const raw = value.trim().replace(/,/g, "");
  const match = raw.match(/^(\d+)$/) ?? raw.match(/(\d+)\s*(?:נכסים|נכס(?:ים)? פעיל|מודעות|נכסים למכירה|נכסים להשכרה|properties|listings)/i);
  return match ? Number(match[1]) : null;
}
function agencyVolumeAllowed(row, min, _max) {
  const count = agencyListingCount(row.active_listing_count);
  return count === null || count >= min;
}
function agencyUrl(value, base = AGENCIES_URL) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const u = new URL(value, base);
    if (u.protocol !== "https:" || u.hostname !== "www.yad2.co.il" || u.username || u.password || !/^\/realestate\/(?:agencies(?:\/|$)|agency\/\d+(?:\/|$))/.test(u.pathname)) return null;
    u.hash = "";
    return u.href;
  } catch {
    return null;
  }
}
var AGENCY_DIRECTORY_LEVELS = ["topArea", "area", "city", "neighborhood"];
function agencyDirectoryQuery(value) {
  const input = new URLSearchParams(typeof value === "string" ? value.replace(/^\?/, "") : "");
  const out = new URLSearchParams();
  for (const level of AGENCY_DIRECTORY_LEVELS) {
    const v = input.get(level);
    if (v && /^\d{1,9}$/.test(v)) out.set(level, v);
    else break;
  }
  return out.toString();
}
function agencyDirectoryUrl(query = "") {
  const q = agencyDirectoryQuery(query);
  return q ? `${AGENCIES_URL}?${q}` : AGENCIES_URL;
}
function nextData($) {
  try {
    return JSON.parse($("script#__NEXT_DATA__").first().text() || "null");
  } catch {
    return null;
  }
}
function parseAgencyDirectoryData(data, sourceUrl2) {
  const text2 = (v) => typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  const query = agencyDirectoryQuery(new URL(sourceUrl2).search);
  const seen = /* @__PURE__ */ new Set();
  const results = [];
  for (const office of Array.isArray(data?.["realtor-index"]) ? data["realtor-index"] : []) {
    const id = String(office?.CustID ?? "");
    if (!/^\d{1,12}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    const logo = text2(office.office_logo_url);
    results.push({
      source_url: `https://www.yad2.co.il/realestate/agency/${id}`,
      active_listing_count: agencyListingCount(office.total),
      owner_name: null,
      owner_phone: null,
      owner_email: null,
      listing_urls: [],
      publisher: {
        publisher_kind: "broker",
        office_name: text2(office.office_name) || null,
        broker_name: null,
        office_logo_url: logo ? logo.startsWith("//") ? `https:${logo}` : logo : null
      }
    });
  }
  const children = [];
  for (const node of Array.isArray(data?.geographical) ? data.geographical : []) {
    const level = node?.nextLevelName;
    const id = String(node?.id ?? "");
    if (!AGENCY_DIRECTORY_LEVELS.includes(level) || !/^\d{1,9}$/.test(id)) continue;
    const q = new URLSearchParams(query);
    q.set(level, id);
    const child = agencyDirectoryQuery(q.toString());
    if (child && child !== query && !children.includes(child)) children.push(child);
  }
  return { results: results.map((r) => ({ ...r, directory_next_url: null })), next_url: null, children };
}
function parseAgencies($, sourceUrl2) {
  const blocked = /Radware Page|ShieldSquare|captcha|אנו מניחים שגולשים/.test($("title").text() + $("body").text().slice(0, 600));
  if (blocked) throw new Error("\u05D9\u05D32 \u05D4\u05D7\u05D6\u05D9\u05E8 \u05E2\u05DE\u05D5\u05D3 \u05D7\u05E1\u05D9\u05DE\u05D4 \u05D1\u05DE\u05E7\u05D5\u05DD \u05E1\u05E4\u05E8\u05D9\u05D9\u05EA \u05DE\u05E9\u05E8\u05D3\u05D9\u05DD");
  const directory = nextData($)?.props?.pageProps?.data;
  if (Array.isArray(directory?.["realtor-index"])) return parseAgencyDirectoryData(directory, sourceUrl2);
  const rows = [];
  const seen = /* @__PURE__ */ new Set();
  const text2 = (v) => typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  const add = (r) => {
    const same = rows.filter((v) => v.source_url === r.source_url);
    for (const v of same) {
      if (r.active_listing_count != null) v.active_listing_count = r.active_listing_count;
      else if (v.active_listing_count != null) r.active_listing_count = v.active_listing_count;
    }
    const key = `${r.source_url}:${r.publisher?.broker_license_number ?? ""}:${r.publisher?.broker_name ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      rows.push(r);
    }
  };
  const ownListings = (links) => batchListingUrls(links.flatMap((v) => {
    const raw = typeof v === "string" ? v : v && typeof v === "object" ? v.url ?? v.href : null;
    try {
      return raw ? [new URL(raw, sourceUrl2).href] : [];
    } catch {
      return [];
    }
  }));
  const structured = (node, office = "", parentUrl = sourceUrl2, parentCount = null, parentDescription = "") => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((v) => structured(v, office, parentUrl, parentCount, parentDescription));
      return;
    }
    const officeName = text2(node.office_name ?? node.agencyName ?? node.agency?.name ?? office);
    const agencyDescription = text2(node.agencyDescription ?? node.agencyAbout ?? node.aboutAgency ?? node.agency?.description ?? node.agency?.about).slice(0, 5e3) || parentDescription;
    const license = text2(String(node.broker_license_number ?? node.licenseNumber ?? node.license_number ?? ""));
    const name = text2(node.broker_name ?? node.brokerName ?? node.fullName ?? node.full_name);
    const url = agencyUrl(node.url ?? node.href ?? node.link, sourceUrl2) ?? parentUrl;
    const count = agencyListingCount(node.activeListingCount ?? node.active_listing_count ?? node.propertiesCount ?? node.propertyCount ?? node.listingsCount ?? node.listingCount ?? node.totalProperties) ?? parentCount;
    if (name || agencyUrl(node.url ?? node.href ?? node.link, sourceUrl2)) add({
      source_url: url,
      active_listing_count: count,
      owner_name: name || null,
      owner_phone: batchPhone(node.mobile ?? node.phone ?? node.phoneNumber ?? ""),
      owner_email: text2(node.email) || null,
      listing_urls: ownListings(node.listings ?? node.items ?? []),
      publisher: {
        publisher_kind: "broker",
        broker_name: name || null,
        office_name: officeName || text2(node.name) || null,
        agency_description: agencyDescription || null,
        .../^[1-9]\d{3,9}$/.test(license) && name ? { broker_license_number: license } : {}
      }
    });
    for (const [key, value] of Object.entries(node)) {
      if (/^(listings|items|related|recommendations|ads|feed)$/i.test(key)) continue;
      if (value && typeof value === "object") structured(value, officeName || text2(node.name), url, count, agencyDescription);
    }
  };
  $('script#__NEXT_DATA__, script[type="application/json"]').each((_, el) => {
    try {
      structured(JSON.parse($(el).text()));
    } catch {
    }
  });
  const selector = '[data-testid*="agency-card"], [data-testid*="agency-item"], [class*="agency-card"], [class*="agency-item"], [class*="agency_item"], [class*="agencyItem"], [class*="AgencyItem"], [class*="agency-box"], li:has(> a[href*="/realestate/agency/"]), [data-testid*="broker-card"], [data-testid*="agent-card"], [class*="agencyCard"], [class*="AgencyCard"], [class*="brokerCard"], [class*="BrokerCard"], [class*="agentCard"], [class*="AgentCard"]';
  let cards = $(selector);
  $('a[href*="/realestate/agency/"]').each((_, el) => {
    const link = $(el);
    const url = agencyUrl(link.attr("href"), sourceUrl2);
    if (url) add({ source_url: url, active_listing_count: agencyListingCount(link.text()), publisher: { publisher_kind: "broker", office_name: text2(link.find("h2,h3").first().text() || link.text()) }, listing_urls: [] });
  });
  cards.each((_, el) => {
    const card = $(el);
    if (card.closest('[class*="related"], [class*="recommend"]').length) return;
    const name = text2(card.find('[data-testid="broker-name"], [class*="brokerName"], [class*="BrokerName"], [class*="contactName"]').first().text());
    const office = text2(card.find('[data-testid="agency-name"], [class*="agencyName"], [class*="AgencyName"], [class*="agency-name"], [class*="agency_name"], [class*="title"], h2, h3, h4').first().text());
    const license = card.text().match(/(?:(?:מספר|מס['׳]?)\s*)?רישיון\s*(?:תיווך|מתווך)?\s*[:#]?\s*([1-9]\d{3,9})(?!\d)/)?.[1];
    const url = agencyUrl(card.find('a[href*="/realestate/agencies/"],a[href*="/realestate/agency/"]').first().attr("href"), sourceUrl2) ?? sourceUrl2;
    if (!office && !name) return;
    const count = agencyListingCount(card.attr("data-listing-count") ?? card.find('[data-testid*="property-count"], [data-testid*="listing-count"], [class*="propertyCount"], [class*="listingCount"], [class*="property-count"], [class*="assets"], [class*="count"]').first().text()) ?? agencyListingCount(card.text());
    add({
      source_url: url,
      active_listing_count: count,
      owner_name: name || null,
      owner_phone: batchPhone(card.find('a[href^="tel:"]').first().attr("href") ?? ""),
      owner_email: text2(card.find('a[href^="mailto:"]').first().attr("href")?.replace(/^mailto:/, "").split("?")[0]) || null,
      listing_urls: name && license ? ownListings(card.find('a[href*="/realestate/item/"]').map((_2, a) => $(a).attr("href")).get()) : [],
      publisher: { publisher_kind: "broker", office_name: office || null, broker_name: name || null, agency_description: text2(card.find('[data-testid="agency-description"], [data-testid="agency-about"], [class*="agencyDescription"], [class*="AgencyDescription"], [class*="agencyAbout"], [class*="AgencyAbout"]').first().text()).slice(0, 5e3) || null, ...name && license ? { broker_license_number: license } : {} }
    });
  });
  const challenge = /Radware Page|ShieldSquare|captcha|אנו מניחים שגולשים/.test($("title").text() + $("body").text().slice(0, 600));
  if (challenge) throw new Error("\u05D9\u05D32 \u05D4\u05D7\u05D6\u05D9\u05E8 \u05E2\u05DE\u05D5\u05D3 \u05D7\u05E1\u05D9\u05DE\u05D4 \u05D1\u05DE\u05E7\u05D5\u05DD \u05E1\u05E4\u05E8\u05D9\u05D9\u05EA \u05DE\u05E9\u05E8\u05D3\u05D9\u05DD");
  if (!rows.length && !/לא נמצאו|אין משרדי תיווך/.test($("main").text())) throw new Error("\u05DC\u05D0 \u05D6\u05D5\u05D4\u05D5 \u05DB\u05E8\u05D8\u05D9\u05E1\u05D9 \u05DE\u05E9\u05E8\u05D3\u05D9\u05DD; \u05D4\u05D4\u05EA\u05E7\u05D3\u05DE\u05D5\u05EA \u05E0\u05E9\u05DE\u05E8\u05D4 \u05DC\u05D1\u05D3\u05D9\u05E7\u05D4 \u05D1\u05DE\u05E7\u05D5\u05DD \u05DC\u05E1\u05D9\u05D9\u05DD \u05E1\u05E8\u05D9\u05E7\u05D4 \u05E8\u05D9\u05E7\u05D4");
  const nextUrl = agencyUrl($('a[rel="next"]').attr("href"), sourceUrl2);
  const results = rows.map((row) => ({ ...row, directory_next_url: nextUrl }));
  return { results, next_url: nextUrl };
}

// ../supabase/functions/_shared/projectHierarchy.ts
var sourceRecord = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
var string = (value) => typeof value === "string" || typeof value === "number" ? String(value) : null;
var first = (row, keys) => keys.map((key) => row[key]).find((value) => value != null && value !== "");
var numeric = (value) => {
  const raw = string(value);
  if (raw == null || !raw.trim()) return null;
  const number2 = Number(raw.replace(/[,₪\s]/g, ""));
  return Number.isFinite(number2) ? number2 : null;
};
var buildingKeys = /^(buildings|building|towers|tower|blocks|block)$/i;
var unitKeys = /^(apartments|apartment|units|unit|unitTypes|apartmentTypes|models|properties)$/i;
var ignoredKeys = /^(related|recommendations|similar|source_details|source_snapshots|hierarchy)$/i;
function images(value) {
  const out = /* @__PURE__ */ new Set();
  const walk = (v, context = false, depth = 0) => {
    if (depth > 20) return;
    if (typeof v === "string" && context && /^https:\/\//i.test(v)) out.add(v);
    else if (Array.isArray(v)) v.forEach((item) => walk(item, context, depth + 1));
    else if (v && typeof v === "object") Object.entries(v).forEach(([key, item]) => {
      if (!ignoredKeys.test(key)) walk(item, /image|photo|gallery|thumbnail|cover/i.test(key) || context && /url|src/i.test(key), depth + 1);
    });
  };
  walk(value);
  return [...out];
}
function mergeSource(old, fresh) {
  if (fresh == null || fresh === "") return old ?? fresh;
  if (Array.isArray(fresh)) {
    const previous = Array.isArray(old) ? old : [];
    const result = [...previous];
    for (const value of fresh) {
      const row = sourceRecord(value);
      const identity = first(row, ["source_building_id", "source_unit_id", "buildingId", "apartmentId", "unitId", "id", "token"]);
      const index = result.findIndex((item) => identity != null ? first(sourceRecord(item), ["source_building_id", "source_unit_id", "buildingId", "apartmentId", "unitId", "id", "token"]) === identity && (sourceRecord(item).building_id ?? null) === (row.building_id ?? null) : JSON.stringify(item) === JSON.stringify(value));
      if (index < 0) result.push(value);
      else result[index] = mergeSource(result[index], value);
    }
    return result;
  }
  if (typeof fresh === "object") {
    const result = { ...sourceRecord(old) };
    Object.entries(sourceRecord(fresh)).forEach(([key, value]) => {
      result[key] = mergeSource(result[key], value);
    });
    return result;
  }
  return fresh;
}
function extractProjectHierarchy(source) {
  const buildings = /* @__PURE__ */ new Map();
  const apartments = /* @__PURE__ */ new Map();
  const walk = (value, context = "", parent = null, path = "project", depth = 0) => {
    if (depth > 30) return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, context, parent, `${path}.${index}`, depth + 1));
      return;
    }
    if (!value || typeof value !== "object") return;
    const row = sourceRecord(value);
    let building = parent;
    if (buildingKeys.test(context)) {
      const id = string(first(row, ["source_building_id", "buildingId", "towerId", "id", "token"])) ?? path;
      building = { ...row, source_building_id: id, name: string(first(row, ["buildingName", "towerName", "name", "title", "number"])), units: [] };
      buildings.set(id, building);
    }
    const isUnit = unitKeys.test(context) || (row.rooms != null || row.roomsCount != null) && ["price", "floor", "floorNumber", "squareMeter", "squareMeters", "area", "size", "size_sqm"].some((key) => row[key] != null);
    if (isUnit && !buildingKeys.test(context)) {
      const id = string(first(row, ["source_unit_id", "apartmentId", "unitId", "id", "token"])) ?? path;
      const buildingId = string(first(row, ["building_id", "buildingId", "towerId"])) ?? building?.source_building_id ?? null;
      const unit = {
        ...row,
        source_unit_id: id,
        building_id: buildingId,
        building_name: string(row.building_name) ?? building?.name ?? null,
        rooms: numeric(first(row, ["rooms", "roomsCount", "numberOfRooms"])),
        floor: string(first(row, ["floor", "floorNumber"])),
        size_sqm: numeric(first(row, ["size_sqm", "squareMeter", "squareMeters", "area", "size"])),
        price: numeric(first(row, ["price", "priceFrom", "askingPrice"])),
        balcony_sqm: numeric(first(row, ["balcony_sqm", "balconyArea", "balconySize"])),
        count: numeric(first(row, ["count", "availableUnits", "unitsCount"])),
        type: string(first(row, ["propertyType", "assetType", "type"])),
        images: images(row),
        source_details: row.source_details ?? row
      };
      const key = `${buildingId ?? ""}:${id}`;
      apartments.set(key, mergeSource(apartments.get(key), unit));
    }
    Object.entries(row).forEach(([key, item]) => {
      if (!ignoredKeys.test(key) && key !== "images") walk(item, key, building, `${path}.${key}`, depth + 1);
    });
  };
  walk(source);
  for (const unit of apartments.values()) {
    if (!unit.building_id) continue;
    if (!buildings.has(unit.building_id)) buildings.set(unit.building_id, { source_building_id: unit.building_id, name: unit.building_name, units: [] });
    buildings.get(unit.building_id)?.units.push(unit);
  }
  return { buildings: [...buildings.values()], apartments: [...apartments.values()] };
}
function savedProjectHierarchy(project) {
  const details = sourceRecord(project.source_details);
  const hierarchy = sourceRecord(details.hierarchy);
  const original = extractProjectHierarchy(Object.keys(hierarchy).length ? hierarchy : details);
  const edited = extractProjectHierarchy({ apartments: project.apartments ?? [] });
  const units = new Map(original.apartments.map((unit) => [`${unit.building_id ?? ""}:${unit.source_unit_id}`, unit]));
  const manual = sourceRecord(details.manual);
  const excluded = new Set((Array.isArray(manual.excluded_units) ? manual.excluded_units : []).filter((key) => typeof key === "string"));
  const excludedUnit = (unit) => excluded.has(JSON.stringify([unit.building_id ?? "", unit.source_unit_id]));
  [...units.keys()].forEach((key) => {
    const unit = units.get(key);
    if (unit && excludedUnit(unit)) units.delete(key);
  });
  edited.apartments.forEach((unit) => {
    if (excludedUnit(unit)) return;
    const key = `${unit.building_id ?? ""}:${unit.source_unit_id}`;
    const merged = mergeSource(units.get(key), unit);
    if (unit.images.length > 0) merged.images = [...unit.images];
    units.set(key, merged);
  });
  const grouped = original.buildings.map((building) => ({ ...building, units: [...units.values()].filter((unit) => unit.building_id === building.source_building_id) }));
  [...units.values()].forEach((unit) => {
    if (unit.building_id && !grouped.some((building) => building.source_building_id === unit.building_id)) grouped.push({ source_building_id: unit.building_id, name: unit.building_name, units: [...units.values()].filter((item) => item.building_id === unit.building_id) });
  });
  return { buildings: grouped, apartments: [...units.values()], unassigned: [...units.values()].filter((unit) => !unit.building_id) };
}

// ../supabase/functions/_shared/yad2DeveloperImport.ts
var record = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var text = (v) => typeof v === "string" || typeof v === "number" ? String(v).trim() || null : null;
var pick = (o, keys) => keys.map((k) => text(k.split(".").reduce((v, key) => record(v) ? v[key] : void 0, o))).find(Boolean) ?? null;
var number = (v) => {
  const t = text(v);
  if (!t) return null;
  const n = Number(t.replace(/[,₪\s‏‎]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
};
var PROJECT_PATH = /^\/yad1\/(?:project|projects)\/[^/]+\/?$/i;
var DEVELOPER_PATH = /^\/yad1\/developers\/[^/]+\/?$/i;
function projectInventoryUrl(value, parentUrl) {
  const parent = developerImportUrl(parentUrl);
  const candidate = sourceUrl(value, parentUrl);
  if (!parent || developerImportPageKind(parent) !== "project" || !candidate) return null;
  const base = new URL(parent), url = new URL(candidate);
  const prefix = base.pathname.replace(/\/$/, "");
  if (url.pathname !== prefix && !new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/(?:apartments?|units?|inventory|buildings?)(?:/[^/]+)*?/?$`, "i").test(url.pathname)) return null;
  if (url.pathname === prefix && !url.searchParams.has("page")) return null;
  for (const key of [...url.searchParams.keys()]) if (!["page", "offset", "building", "buildingId", "unit", "unitId"].includes(key)) url.searchParams.delete(key);
  url.hash = "";
  return url.href;
}
function developerImportPageKind(value) {
  const raw = value.trim().match(/(?:https?:\/\/)?(?:[a-z0-9-]+\.)*yad2\.co\.il\/[^\s<>]+/i)?.[0];
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (url.protocol !== "https:" || !/(^|\.)yad2\.co\.il$/i.test(url.hostname)) return null;
    if (DEVELOPER_PATH.test(url.pathname)) return "profile";
    if (PROJECT_PATH.test(url.pathname)) return "project";
    return null;
  } catch {
    return null;
  }
}
function developerImportUrl(value) {
  const raw = value.trim().match(/(?:https?:\/\/)?(?:[a-z0-9-]+\.)*yad2\.co\.il\/[^\s<>]+/i)?.[0];
  if (!raw || !developerImportPageKind(raw)) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    url.hash = "";
    url.search = "";
    return url.href;
  } catch {
    return null;
  }
}
function sourceUrl(value, base) {
  const t = text(value);
  if (!t || !t.startsWith("/") && !/^https?:\/\//i.test(t)) return null;
  try {
    const u = new URL(t, base);
    return u.protocol === "https:" && /(^|\.)yad2\.co\.il$/i.test(u.hostname) ? u.href : null;
  } catch {
    return null;
  }
}
function imagesOf(o) {
  const out = /* @__PURE__ */ new Set();
  const walk = (v, imageContext = false, depth = 0) => {
    if (depth > 18) return;
    if (typeof v === "string" && imageContext && /^https?:\/\//i.test(v)) out.add(v);
    else if (Array.isArray(v)) v.forEach((x) => walk(x, imageContext, depth + 1));
    else if (record(v)) Object.entries(v).forEach(([k, x]) => walk(x, /image|photo|gallery|thumbnail|cover|logo/i.test(k) || imageContext && /src|url/.test(k), depth + 1));
  };
  walk(o);
  return [...out];
}
function sourceTimeline(row) {
  const candidate = row.timeline ?? row.projectTimeline ?? row.statusTimeline ?? row.constructionTimeline ?? row.milestones ?? row.projectMilestones ?? row.constructionStages ?? row.projectStages;
  const values = Array.isArray(candidate) ? candidate : record(candidate) ? Object.entries(candidate).map(([label, value]) => record(value) ? { label, ...value } : { label, value }) : [];
  const timeline = values.flatMap((entry) => {
    if (typeof entry === "string" || typeof entry === "number") return [{ label: String(entry) }];
    if (!record(entry)) return [];
    const label = pick(entry, ["label", "title", "name", "text", "milestone", "stage.text", "stage", "status.text", "status"]);
    const date = pick(entry, ["date", "displayDate", "deliveryDate", "occupancyDate", "completedAt", "value"]);
    const status = pick(entry, ["state.text", "state", "statusText", "status.text"]);
    const current = typeof entry.current === "boolean" ? entry.current : typeof entry.isCurrent === "boolean" ? entry.isCurrent : void 0;
    const completed = typeof entry.completed === "boolean" ? entry.completed : typeof entry.isCompleted === "boolean" ? entry.isCompleted : void 0;
    return label || date || status ? [{ ...label ? { label } : {}, ...date ? { date } : {}, ...status ? { status } : {}, ...current == null ? {} : { current }, ...completed == null ? {} : { completed } }] : [];
  });
  if (timeline.length) return timeline;
  const code = text(row.timelineStatus ?? row.additionalDetails?.timelineStatus);
  return code ? [{ source_code: code }] : [];
}
function cleanProjectName(value) {
  return value.split("|")[0].replace(/^פרויקט\s+/, "").trim();
}
function jsonLdProject(payload, base) {
  if (!record(payload) || payload["@type"] !== "RealEstateListing" || !record(payload.mainEntity)) return payload;
  const complex = payload.mainEntity;
  const provider = record(payload.provider) ? payload.provider : null;
  const url = sourceUrl(payload.url ?? complex.url, base);
  const sourceId = url?.match(/\/yad1\/(?:project|projects)\/([^/?]+)/i)?.[1] ?? null;
  const name = pick(complex, ["name"]) ?? pick(payload, ["name"]);
  return {
    project: {
      ...complex,
      projectName: name ? cleanProjectName(name) : null,
      projectId: sourceId,
      projectYzerId: sourceId,
      projectUrl: url,
      images: payload.image ?? complex.image ?? [],
      description: payload.description ?? complex.description,
      companyDetails: provider ? [provider] : []
    }
  };
}
function extractDeveloper(payloads, base) {
  const projects = /* @__PURE__ */ new Map();
  let developer = { company_name: null, phone: null, logo_url: null, bio: null };
  const walk = (v, context = "", depth = 0) => {
    if (depth > 24) return;
    if (Array.isArray(v)) {
      v.forEach((x) => walk(x, context, depth + 1));
      return;
    }
    if (!record(v)) return;
    const row = record(v.metaData) && /^(projects|project|projectDetails|developerProjects)$/i.test(context) ? { ...v, ...v.metaData } : v;
    const captureDeveloper = (company) => {
      developer = {
        company_name: pick(company, ["companyName", "company_name", "developerName", "developer_name", "businessName", "contractorName", "name", "title"]) ?? developer.company_name,
        phone: pick(company, ["phone", "phoneNumber", "contactPhone", "telephone"]) ?? developer.phone,
        logo_url: pick(company, ["logo.url", "logo", "logoUrl", "image.url", "image"]) ?? developer.logo_url,
        bio: pick(company, ["biography", "about", "description", "info"])?.slice(0, 5e3) ?? developer.bio
      };
    };
    if (/^(developer|company|developerDetails|companyDetails|developerInfo|companyInfo|projectDeveloper|contractor|entrepreneur|provider|organization)$/i.test(context)) captureDeveloper(row);
    for (const key of ["companyDetails", "developerDetails", "companyInfo", "developerInfo", "projectDeveloper", "contractor", "provider"]) {
      const value = row[key];
      if (Array.isArray(value)) value.filter(record).forEach(captureDeveloper);
      else if (record(value)) captureDeveloper(value);
    }
    const name = pick(row, ["projectName", "project_name", "title", "name"]);
    const isProject = name && !/developer|company/i.test(String(row.__typename ?? "")) && (row.projectName != null || row.projectId != null || /^(projects|project|projectDetails|developerProjects)$/i.test(context));
    if (isProject) {
      const hierarchy = extractProjectHierarchy(row);
      const apts = hierarchy.apartments;
      const sourceId = pick(row, ["projectYzerId", "token", "projectId", "project_id", "id", "slug"]);
      const sourceStatus = pick(row, ["projectStatus.text", "projectStatusText", "statusText", "constructionStatus.text", "constructionStatus", "projectStage.text", "projectStage", "additionalDetails.projectStatus.text", "additionalDetails.projectStatus", "projectStatus", "status.text", "status", "stage"]);
      const p = {
        source_project_id: sourceId,
        name,
        city: pick(row, ["city.text", "cityName", "city", "address.city.text", "address.city", "address.addressLocality", "location.city"]),
        neighborhood: pick(row, ["neighborhood.text", "neighborhood", "address.neighborhood.text", "address.addressRegion"]),
        address: pick(row, ["fullAddress", "address.display", "address.streetAddress", "address.street.text", "street.text", "street", "streetName", "address"]),
        total_units: number(row.totalUnits ?? row.unitsCount ?? row.numberOfUnits ?? row.apartmentsCount ?? row.totalApartments ?? row.numberOfAccommodationUnits ?? (typeof row.apartments === "number" ? row.apartments : null)),
        available_units: number(row.availableUnits ?? row.availableApartments ?? row.unitsForSale),
        price_from: number(row.priceFrom ?? row.minPrice ?? row.startingPrice ?? row.additionalDetails?.minPrice),
        delivery_date: pick(row, ["deliveryDate", "occupancyDate", "entryDate", "completionDate", "additionalDetails.entranceDate"]),
        status: sourceStatus,
        source_status: sourceStatus,
        timeline: sourceTimeline(row),
        description: pick(row, ["description", "about", "info"]),
        images: imagesOf(row),
        source_url: sourceUrl(pick(row, ["projectUrl", "url", "link"]), base) ?? (sourceId ? `https://www.yad2.co.il/yad1/project/${encodeURIComponent(sourceId)}` : null),
        apartments: apts,
        buildings: hierarchy.buildings,
        source_details: { ...row, hierarchy }
      };
      const key = p.source_project_id ?? p.source_url ?? p.name;
      const old = projects.get(key);
      projects.set(key, old ? mergeProject(old, p) : p);
      return;
    }
    Object.entries(row).forEach(([k, x]) => {
      if (!/related|recommendations|similar/i.test(k)) walk(x, k, depth + 1);
    });
  };
  payloads.forEach((p) => walk(jsonLdProject(p, base)));
  return { developer, projects: [...projects.values()] };
}
var decodeHtml = (value) => value.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#x27;/g, "'").replace(/&rlm;|&lrm;|&rlm;/g, "").replace(/[‏‎]/g, "");
var htmlValue = (html, testId) => {
  const match = html.match(new RegExp(`<[^>]+data-testid=["']${testId}["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, "i"));
  return match ? decodeHtml(match[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim() : null;
};
var pageTitle = (html) => decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim();
function extractRenderedHtml(html, base) {
  const kind = developerImportPageKind(base);
  const title = pageTitle(html);
  const developer = { company_name: null, phone: null, logo_url: null, bio: null };
  if (kind === "profile" && title) developer.company_name = title.split("|")[0].replace(/^חברת\s+/, "").trim() || null;
  if (kind === "project" && title.includes("|")) developer.company_name = title.split("|").slice(1).join("|").trim() || null;
  const cards = [];
  for (const match of html.matchAll(/<li[^>]+data-testid=["']feed-project-card["'][^>]*>([\s\S]*?)<\/li>/gi)) {
    const card = match[1];
    const name = htmlValue(card, "feed-project-label");
    const href = sourceUrl(card.match(/<a[^>]+href=["']([^"']+)["']/i)?.[1]?.replace(/&amp;/g, "&"), base);
    if (!name || !href) continue;
    const address = htmlValue(card, "feed-project-subtitle");
    const image = card.match(/<img[^>]+class=["'][^"']*mainImage[^"']*["'][^>]+src=["']([^"']+)["']/i)?.[1] ?? card.match(/<img[^>]+src=["']([^"']+)["'][^>]+class=["'][^"']*mainImage/i)?.[1] ?? null;
    cards.push({ projectName: name, projectId: href.match(/\/yad1\/(?:project|projects)\/([^/?]+)/i)?.[1], projectUrl: href, address: { display: address, city: address?.split(",").at(-1)?.trim() }, priceFrom: htmlValue(card, "feed-project-value"), images: image ? [image] : [], projectStatusText: htmlValue(card, "feed-project-status") });
  }
  const parsed = extractDeveloper([{ projects: cards }], base);
  const timeline = [];
  const statusSection = html.match(/<section[^>]+data-testid=["']project-building-status["'][^>]*>([\s\S]*?)<\/section>/i)?.[1] ?? "";
  for (const match of statusSection.matchAll(/<div[^>]+data-testid=["']building-status-step-[^"']+["'][^>]*>([\s\S]*?)<\/div>/gi)) {
    const label = decodeHtml(match[1].match(/<span[^>]*>([\s\S]*?)<\/span>/i)?.[1]?.replace(/<[^>]+>/g, " ") ?? "").replace(/\s+/g, " ").trim();
    if (label) timeline.push({ label, completed: /data-completed=["']true["']/i.test(match[0]) });
  }
  return { developer, projects: parsed.projects, timeline };
}
function mergeProject(old, fresh) {
  const merged = { ...old };
  Object.entries(fresh).forEach(([k, v]) => {
    if (v != null && v !== "" && !Array.isArray(v)) merged[k] = v;
  });
  merged.images = [.../* @__PURE__ */ new Set([...old.images ?? [], ...fresh.images ?? []])];
  merged.timeline = fresh.timeline?.length ? fresh.timeline : old.timeline ?? [];
  const apts = /* @__PURE__ */ new Map();
  [...old.apartments ?? [], ...fresh.apartments ?? []].forEach((u) => {
    const key = `${u.building_id ?? ""}:${u.source_unit_id ?? u.source_url ?? JSON.stringify(u)}`;
    apts.set(key, mergeSource(apts.get(key), u));
  });
  merged.apartments = [...apts.values()];
  merged.buildings = mergeSource(old.buildings ?? [], fresh.buildings ?? []);
  merged.source_details = mergeSource(old.source_details, fresh.source_details);
  return merged;
}
function unitAdUrl(l) {
  const token = text(l.token);
  return token && /^[A-Za-z0-9_-]+$/.test(token) ? `https://www.yad2.co.il/realestate/item/${token}` : null;
}
function projectListingUnits(listings, base) {
  return listings.filter(record).flatMap((l) => {
    const id = text(l.listingId ?? l.token);
    if (!id) return [];
    const d = record(l.additionalDetails) ? l.additionalDetails : {};
    const a = record(l.address) ? l.address : {};
    const price = number(l.price);
    return [{
      source_unit_id: id,
      building_id: null,
      building_name: null,
      rooms: number(d.roomsCount ?? d.rooms),
      floor: text(d.floor ?? (record(a.house) ? a.house.floor : null)),
      size_sqm: number(d.squareMeter ?? d.squareMeters ?? d.area),
      price: price && price > 0 ? price : null,
      type: text(record(d.property) ? d.property.text : null),
      address: text(a.display),
      images: imagesOf(l),
      source_url: unitAdUrl(l) ?? developerImportUrl(base),
      source_details: l
    }];
  });
}
function readPage(html, base, parentProject) {
  const payloads = [];
  for (const m of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)) {
    const t = (m[1] ?? "").trim();
    try {
      payloads.push(JSON.parse(t));
    } catch {
      const start = t.indexOf("{"), end = t.lastIndexOf("}");
      if (start >= 0 && end > start) try {
        payloads.push(JSON.parse(t.slice(start, end + 1)));
      } catch {
      }
    }
  }
  const links = /* @__PURE__ */ new Set();
  for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) {
    const url = sourceUrl(m[1].replace(/&amp;/g, "&"), base);
    if (url && PROJECT_PATH.test(new URL(url).pathname)) links.add(url.split("?")[0]);
  }
  const result = extractDeveloper(payloads, base);
  if (parentProject) {
    const hierarchy = extractProjectHierarchy(payloads);
    const matching = result.projects.filter((project) => sameProject(parentProject, project));
    result.projects = [matching.reduce((old, fresh) => mergeProject(old, fresh), {
      ...parentProject,
      apartments: hierarchy.apartments,
      buildings: hierarchy.buildings,
      source_details: { hierarchy }
    })];
  }
  if (developerImportPageKind(base) === "project") {
    for (const payload of payloads) {
      const props = record(payload) && record(payload.props) && record(payload.props.pageProps) ? payload.props.pageProps : null;
      if (!props || !Array.isArray(props.listings)) continue;
      const units = projectListingUnits(props.listings, base);
      if (!units.length) continue;
      const projectId = text(record(props.project) ? props.project.projectYzerId ?? props.project.token : null) ?? text(units[0].source_details?.projectYzerId);
      let target = result.projects.find((p) => projectId && String(p.source_project_id) === projectId) ?? (result.projects.length === 1 ? result.projects[0] : null);
      if (!target && parentProject) {
        target = { ...parentProject };
        result.projects.push(target);
      }
      if (!target) continue;
      Object.assign(target, mergeProject(target, { apartments: units }));
    }
  }
  const rendered = extractRenderedHtml(html, base);
  result.developer.company_name ??= rendered.developer.company_name;
  result.developer.phone ??= rendered.developer.phone;
  result.developer.logo_url ??= rendered.developer.logo_url;
  result.developer.bio ??= rendered.developer.bio;
  for (const project of rendered.projects) {
    const old = result.projects.find((p) => project.source_project_id && p.source_project_id === project.source_project_id || project.source_url && p.source_url === project.source_url);
    if (old) Object.assign(old, mergeProject(old, project));
    else result.projects.push(project);
  }
  if (rendered.timeline.length) {
    const canonicalBase = developerImportUrl(base);
    for (const project of result.projects) {
      if (developerImportPageKind(base) === "project" || project.source_url === canonicalBase) project.timeline = rendered.timeline;
    }
  }
  result.projects.forEach((p) => {
    if (p.source_url) links.add(p.source_url);
  });
  const inventoryPages = [];
  const parents = parentProject ? [parentProject] : result.projects;
  for (const project of parents) {
    if (!project.source_url) continue;
    const collect = (value, depth = 0) => {
      if (depth > 30) return;
      if (typeof value === "string") {
        const url = projectInventoryUrl(value.replace(/&amp;/g, "&"), project.source_url);
        if (url && url !== base && !inventoryPages.some((page) => page.url === url)) inventoryPages.push({ url, parent: { source_project_id: project.source_project_id, name: project.name, city: project.city, source_url: project.source_url } });
      } else if (Array.isArray(value)) value.forEach((item) => collect(item, depth + 1));
      else if (record(value)) Object.entries(value).forEach(([key, item]) => {
        if (!/related|recommendations|similar/i.test(key)) collect(item, depth + 1);
      });
    };
    payloads.forEach((payload) => collect(payload));
    for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) collect(match[1]);
  }
  return { ...result, links: [...links], inventoryPages, timeline: rendered.timeline };
}
function newDeveloperQueueWork(url, expectedProjects, maxProjects) {
  return { url, expectedProjects, ...maxProjects ? { maxProjects } : {}, developer: { company_name: null, phone: null, logo_url: null, bio: null }, projects: [], pendingUrls: [url], visitedUrls: [], dirtyProjectKeys: [] };
}
var projectKey = (project) => String(project.source_project_id ?? project.source_url ?? project.name);
var sameProject = (old, fresh) => fresh.source_project_id && old.source_project_id === fresh.source_project_id || fresh.source_url && old.source_url === fresh.source_url || old.name === fresh.name && (old.city ?? null) === (fresh.city ?? null);
function mergeDeveloperQueuePage(work, page) {
  for (const key of ["company_name", "phone", "logo_url", "bio"]) {
    const value = page.developer?.[key];
    if (value != null && value !== "" && !(key === "company_name" && work.developer.company_name)) work.developer[key] = value;
  }
  for (const project of page.projects ?? []) {
    const index = work.projects.findIndex((old) => sameProject(old, project));
    if (index >= 0) work.projects[index] = mergeProject(work.projects[index], project);
    else if (work.maxProjects && work.projects.length >= work.maxProjects) continue;
    else work.projects.push(project);
    const key = projectKey(project);
    if (!work.dirtyProjectKeys.includes(key)) work.dirtyProjectKeys.push(key);
  }
  if (!work.visitedUrls.includes(page.source_url)) work.visitedUrls.push(page.source_url);
  work.pendingUrls = work.pendingUrls.filter((url) => url !== page.source_url);
  const norm = (u) => {
    try {
      const x = new URL(String(u));
      return x.origin + x.pathname.replace(/\/$/, "");
    } catch {
      return null;
    }
  };
  const kept = new Set(work.projects.map((p) => norm(p.source_url)).filter(Boolean));
  for (const link of page.links ?? []) {
    if (work.maxProjects && work.projects.length >= work.maxProjects && !kept.has(norm(link))) continue;
    if (!work.visitedUrls.includes(link) && !work.pendingUrls.includes(link)) work.pendingUrls.push(link);
  }
  for (const child of page.inventoryPages ?? []) {
    if (projectInventoryUrl(child.url, child.parent.source_url) !== child.url) continue;
    if (work.maxProjects && !kept.has(norm(child.parent.source_url))) continue;
    work.inventoryParents ??= {};
    work.inventoryParents[child.url] = child.parent;
    if (!work.visitedUrls.includes(child.url) && !work.pendingUrls.includes(child.url)) work.pendingUrls.push(child.url);
  }
  return work;
}
function detailedUnitCount(project) {
  return savedProjectHierarchy(project).apartments.length;
}

// ../supabase/functions/_shared/yad2DeveloperDirectory.ts
var DEVELOPER_DIRECTORY_URL = "https://www.yad2.co.il/yad1/developers";
function developerDirectoryUrl(value) {
  try {
    const url = new URL(value, DEVELOPER_DIRECTORY_URL);
    if (url.protocol !== "https:" || url.hostname !== "www.yad2.co.il" || !/^\/yad1\/developers\/?$/.test(url.pathname)) return null;
    const page = Number(url.searchParams.get("page") ?? 1);
    if (!Number.isInteger(page) || page < 1 || page > 100) return null;
    return page === 1 ? DEVELOPER_DIRECTORY_URL : `${DEVELOPER_DIRECTORY_URL}?page=${page}`;
  } catch {
    return null;
  }
}
function parseDeveloperDirectory(html, pageUrl) {
  const source = html.replace(/\\u002[fF]/g, "/").replace(/\\\//g, "/").replace(/&amp;/g, "&");
  const urls = [...new Set((source.match(/(?:https:\/\/(?:www\.)?yad2\.co\.il)?\/yad1\/developers\/\d+/g) ?? []).map((value) => developerImportUrl(new URL(value, pageUrl).href)).filter((value) => Boolean(value) && developerImportPageKind(String(value)) === "profile"))];
  if (!urls.length && /Radware|Verifying your browser|access denied|captcha/i.test(source)) throw new Error("source_blocked");
  const currentPage = Number(new URL(pageUrl).searchParams.get("page") ?? 1);
  const pages = [...source.matchAll(/\/yad1\/developers\/?\?page=(\d+)/g)].map((match) => Number(match[1]));
  const next = pages.filter((page) => page > currentPage).sort((a, b) => a - b)[0];
  return { urls, next_url: next ? developerDirectoryUrl(`${DEVELOPER_DIRECTORY_URL}?page=${next}`) : null };
}

// index.ts
var WorkerError = class extends Error {
  constructor(message, status = 500, retryAfterMs = 0) {
    super(message);
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
};
async function startImportWorker() {
  if (process.env.IMPORT_WORKER_ENABLED !== "true") return;
  const config = configuration(process.env);
  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  let providerSuspended = false;
  const api = async (body) => {
    const response = await fetch(config.api, { method: "POST", headers: { "Content-Type": "application/json", "x-import-worker-secret": config.secret }, body: JSON.stringify({ ...body, worker_id: config.id }), signal: AbortSignal.timeout(15e4) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new WorkerError(result.error ?? `cloud_http_${response.status}`, response.status);
    return result;
  };
  const gate = new RequestGate(config.interval);
  const readSource = async (url) => {
    const target = new URL(url);
    if (target.protocol !== "https:" || !/(^|\.)yad2\.co\.il$/.test(target.hostname) || target.username || target.password) throw new WorkerError("invalid_source_url", 400);
    await gate.enter();
    if (stopping) throw new WorkerError("Worker stopping", 503);
    if (providerSuspended) throw new WorkerError("Bright Data account suspended", 407);
    let response;
    try {
      response = await fetch("https://api.brightdata.com/request", { method: "POST", headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ zone: config.zone, url, format: "raw" }), signal: AbortSignal.timeout(config.timeout) });
    } catch (error) {
      const reason = error.name;
      console.error(JSON.stringify({ event: "source_connection_error", url, zone: config.zone, transport: "Web Unlocker REST", reason, timeout_ms: config.timeout }));
      throw new WorkerError(`Bright Data ${reason} at ${url}`, reason === "TimeoutError" ? 504 : 503);
    }
    const html = await response.text();
    const providerError = `${response.headers.get("x-brd-err-code") ?? ""} ${response.headers.get("x-brd-error") ?? ""}`.trim();
    console.log(JSON.stringify({ event: "source_response", url, status: response.status, zone: config.zone, transport: "Web Unlocker REST", bytes: html.length, provider_error: providerError.split(config.token).join("[redacted]") }));
    if (/client_10020|account.*suspend|billing.*inactive/i.test(providerError + " " + html.slice(0, 500))) {
      providerSuspended = true;
      throw new WorkerError("Bright Data account suspended", 407);
    }
    if (!response.ok || providerError.trim()) {
      const header = response.headers.get("retry-after") ?? "";
      const retry = /^\d+$/.test(header) ? Number(header) * 1e3 : Math.max(0, Date.parse(header) - Date.now());
      const retryMs = Number.isFinite(retry) ? Math.min(18e4, retry) : 0;
      if (response.status === 429) gate.defer(Math.max(15e3, retryMs));
      throw new WorkerError(`Bright Data ${response.status}: ${(providerError || html.slice(0, 300)).split(config.token).join("[redacted]")}`, response.status === 200 ? 502 : response.status, retryMs);
    }
    if (!html.trim()) throw new WorkerError("Bright Data returned an empty page", 502);
    if (html.length > 8e6) throw new WorkerError("Source page exceeds safe size limit", 413);
    return html;
  };
  const runJob = async (job) => {
    const c = structuredClone(job.checkpoint);
    const counts = Object.fromEntries(["brokers_done", "developers_done", "listings_done", "projects_done", "units_done", "skipped"].map((k) => [k, job[k] ?? 0]));
    const scope = { job_id: job.id, lease_token: job.lease_token };
    let lost = false;
    let stage = job.stage;
    const heartbeat = setInterval(() => {
      void api({ action: "progress", ...scope, stage, counts: {}, checkpoint: {} }).then((r) => {
        if (r.stop) lost = true;
      }).catch(() => {
        lost = true;
      });
    }, 3e4);
    const progress = async (status = "running", release = false, error = null) => {
      const checkpoint = { ...c };
      delete checkpoint.brokerResults;
      delete checkpoint.developerResults;
      const r = await api({ action: "progress", ...scope, stage, status, counts, checkpoint, release, error });
      if (r.stop) lost = true;
    };
    const alive = () => {
      if (lost) throw new WorkerError("stale_worker_lease", 409);
    };
    const successful = () => {
      c.transientRetries = 0;
      c.lastSuccessfulActionAt = (/* @__PURE__ */ new Date()).toISOString();
      c.waitUntil = null;
      c.waitReason = null;
    };
    try {
      c.workerFrontier ??= c.autoDevelopers ? [DEVELOPER_DIRECTORY_URL] : c.source === "urls" ? [] : [agencyDirectoryUrl(c.directoryQuery ?? "")];
      c.workerVisited ??= [];
      c.workerEntities ??= c.source === "urls" && !c.autoDevelopers ? [...(c.developerUrls ?? []).map((url) => ({ kind: "developer", url })), ...(c.enrichUrls ?? []).map((url) => ({ kind: "broker", url }))] : [];
      c.workerProcessed ??= [];
      c.workerEnrichment ??= [];
      c.workerEnrichedIds ??= [];
      for (const saved of c.brokerResults ?? []) {
        if (!Array.isArray(saved.listing_urls)) continue;
        counts.brokers_done = Math.max(counts.brokers_done, c.brokerResults.length);
        if (!c.workerEnrichedIds.includes(saved.broker_id) && c.activeBroker?.broker_id !== saved.broker_id && !c.workerEnrichment.some((b) => b.broker_id === saved.broker_id)) c.workerEnrichment.push(saved);
        if (!c.workerProcessed.includes(saved.source_url)) c.workerProcessed.push(saved.source_url);
      }
      while (!stopping && !lost) {
        const identitiesDone = counts.brokers_done + counts.developers_done >= job.target_brokers || !c.workerEntities.some((e) => !c.workerProcessed.includes(e.url)) && !c.workerFrontier.length;
        if (identitiesDone && !c.activeBroker) c.activeBroker = c.workerEnrichment.shift() ?? null;
        if (c.activeBroker) {
          stage = "importing";
          const broker = c.activeBroker;
          c.workerListingDoneUrls ??= broker.listing_urls.slice(0, c.workerListingIndex ?? 0);
          const urls = [...new Set(broker.listing_urls)].filter((url) => !c.workerListingDoneUrls.includes(url)).slice(0, config.concurrency);
          if (!urls.length) {
            c.workerEnrichedIds.push(broker.broker_id);
            c.activeBroker = null;
            c.workerListingDoneUrls = null;
            c.workerListingIndex = 0;
            await progress();
            continue;
          }
          await readAndCommit(urls, readSource, async (url, html) => {
            alive();
            let saved;
            try {
              saved = await api({ action: "listing", ...scope, url, html, broker_id: broker.broker_id });
            } catch (e) {
              if (e.status === 422) {
                counts.skipped++;
                c.workerListingDoneUrls.push(url);
                await progress();
                return;
              }
              throw e;
            }
            if (!saved.listing_id) throw new WorkerError("Listing was not saved");
            c.savedListingIds ??= [];
            if (!c.savedListingIds.includes(saved.listing_id)) {
              c.savedListingIds.push(saved.listing_id);
              counts.listings_done = Math.max(counts.listings_done, c.savedListingIds.length);
            }
            c.workerListingDoneUrls.push(url);
            successful();
            await progress();
          });
          continue;
        }
        if (counts.brokers_done + counts.developers_done >= job.target_brokers) {
          stage = "completed";
          await progress("completed", true);
          break;
        }
        const entity = c.workerEntities.find((e) => !c.workerProcessed.includes(e.url));
        if (entity) {
          stage = entity.kind === "developer" ? "developer_scanning" : "creating";
          const known = await api({ action: "known", ...scope, ...entity });
          if (known.known) {
            c.workerProcessed.push(entity.url);
            counts.skipped++;
            await progress();
            continue;
          }
          if (entity.kind === "broker") {
            const html = await readSource(entity.url);
            let saved2;
            try {
              saved2 = await api({ action: "broker", ...scope, url: entity.url, html });
            } catch (e) {
              if ([400, 409, 422].includes(e.status) && !/(lease|job_not_running)/.test(e.message)) {
                c.workerProcessed.push(entity.url);
                counts.skipped++;
                console.log(JSON.stringify({ event: "broker_rejected", url: entity.url, error: e.message }));
                await progress();
                continue;
              }
              throw e;
            }
            if (saved2.skipped) {
              counts.skipped++;
              console.log(JSON.stringify({ event: "entity_skipped", url: entity.url, reason: saved2.reason }));
            } else {
              c.workerEnrichment.push(saved2.broker);
              counts.brokers_done = Math.max(counts.brokers_done, saved2.brokerResults?.length ?? c.brokerResults?.length ?? counts.brokers_done + 1);
            }
            c.workerProcessed.push(entity.url);
            successful();
            await progress();
            continue;
          }
          c.workerDeveloper ??= newDeveloperQueueWork(entity.url, c.expectedProjects ?? 1, c.maxProjects ?? void 0);
          const work = c.workerDeveloper;
          if (work.pendingUrls.length) {
            const candidates = work.pendingUrls.slice(0, config.concurrency);
            const cappedInventory = candidates.every((url) => work.inventoryParents?.[url] || work.projects.some((p) => p.source_url === url));
            const urls = work.developer.company_name && (!work.maxProjects || cappedInventory) ? candidates : candidates.slice(0, 1);
            await readAndCommit(urls, readSource, async (url, html) => {
              alive();
              if (c.workerProcessed.includes(entity.url)) return;
              const page = readPage(html, url, work.inventoryParents?.[url]);
              mergeDeveloperQueuePage(work, { source_url: url, ...page });
              if (work.developer.company_name) {
                const saved2 = await api({ action: "developer", ...scope, url: entity.url, developer: work.developer, projects: work.projects, partial: true });
                if (saved2.skipped) {
                  work.pendingUrls = [];
                  c.workerProcessed.push(entity.url);
                  counts.skipped++;
                }
                if (saved2.pending) c.externalPendingDeveloper = saved2.pending;
                if (saved2.result) {
                  c.workerDeveloperSaved ??= { projects: 0, units: 0 };
                  counts.projects_done += Math.max(0, saved2.result.projects - c.workerDeveloperSaved.projects);
                  counts.units_done += Math.max(0, saved2.result.units - c.workerDeveloperSaved.units);
                  c.workerDeveloperSaved = { projects: saved2.result.projects, units: saved2.result.units };
                }
              }
              successful();
              await progress();
            });
            if (c.workerProcessed.includes(entity.url)) {
              c.workerDeveloper = null;
              c.workerDeveloperSaved = null;
            }
            continue;
          }
          stage = "developer_saving";
          const saved = await api({ action: "developer", ...scope, url: entity.url, developer: work.developer, projects: work.projects, units: work.projects.reduce((n, p) => n + detailedUnitCount(p), 0) });
          if (saved.skipped) counts.skipped++;
          else {
            counts.developers_done = saved.developerResults?.length ?? counts.developers_done + 1;
            counts.projects_done += Math.max(0, (saved.result?.projects ?? 0) - (c.workerDeveloperSaved?.projects ?? 0));
            counts.units_done += Math.max(0, (saved.result?.units ?? 0) - (c.workerDeveloperSaved?.units ?? 0));
          }
          c.workerProcessed.push(entity.url);
          c.workerDeveloper = null;
          c.workerDeveloperSaved = null;
          delete c.externalPendingDeveloper;
          successful();
          await progress();
          continue;
        }
        if (counts.brokers_done + counts.developers_done >= job.target_brokers || !c.workerFrontier.length) {
          stage = "completed";
          await progress("completed", true);
          break;
        }
        stage = c.autoDevelopers ? "developer_discovering" : "scanning";
        await readAndCommit(c.workerFrontier.slice(0, config.concurrency), readSource, async (url, html) => {
          alive();
          const parsed = c.autoDevelopers ? parseDeveloperDirectory(html, url) : parseAgencies(cheerio.load(html), url);
          const entities = c.autoDevelopers ? parsed.urls.map((url2) => ({ kind: "developer", url: url2 })) : parsed.results.filter((r) => agencyVolumeAllowed(r, job.min_listings)).map((r) => ({ kind: "broker", url: r.source_url, ...r.publisher?.broker_license_number ? { license: r.publisher.broker_license_number } : {} }));
          for (const e of entities) if (!c.workerEntities.some((x) => x.url === e.url)) c.workerEntities.push(e);
          c.workerVisited.push(url);
          c.workerFrontier = c.workerFrontier.filter((u) => u !== url);
          const next = [parsed.next_url, ...(parsed.children ?? []).map((q) => agencyDirectoryUrl(q))].filter(Boolean);
          for (const u of next) if (!c.workerVisited.includes(u) && !c.workerFrontier.includes(u)) c.workerFrontier.push(u);
          if (c.workerVisited.length >= 600) c.workerFrontier = [];
          successful();
          await progress();
        });
      }
      if (stopping && !lost) await progress("running", true);
    } catch (error) {
      const e = error;
      if (e.status === 409 && /lease|job_not_running/.test(e.message)) return;
      c.transientRetries = Math.max(c.transientRetries ?? 0, job.checkpoint?.transientRetries ?? 0) + 1;
      c.lastError = { message: String(e.message ?? "").slice(0, 500), status: e.status ?? null, at: (/* @__PURE__ */ new Date()).toISOString(), stage };
      const permanent = [400, 401, 403, 407, 413, 422].includes(e.status);
      if (permanent || c.transientRetries >= 8) {
        await progress("failed", true, e.message);
      } else {
        c.waitUntil = Date.now() + retryDelay(c.transientRetries, e.retryAfterMs);
        c.waitReason = e.status === 429 ? "rate_limit" : "transient_retry";
        await progress("running", true);
      }
      console.error(JSON.stringify({ event: "job_error", job_id: job.id, status: e.status, attempt: c.transientRetries, error: e.message, wait_until: c.waitUntil ?? null }));
    } finally {
      clearInterval(heartbeat);
    }
  };
  console.log("TORAFF import worker started");
  try {
    while (!stopping && !providerSuspended) {
      try {
        const { job } = await api({ action: "claim" });
        if (job) await runJob(job);
        else await delay(config.poll);
      } catch (error) {
        console.error(JSON.stringify({ event: "worker_connection_error", error: error.message }));
        await delay(15e3);
      }
    }
  } finally {
    process.removeListener("SIGTERM", stop);
    process.removeListener("SIGINT", stop);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) startImportWorker().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
export {
  startImportWorker
};
