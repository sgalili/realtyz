import { extractProjectHierarchy, mergeSource } from '../_shared/projectHierarchy.ts';
type RecordValue = Record<string, any>;
const record = (v: unknown): v is RecordValue => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): string | null => typeof v === 'string' || typeof v === 'number' ? String(v).trim() || null : null;
const pick = (o: RecordValue, keys: string[]) => keys.map(k => text(k.split('.').reduce<any>((v, key) => record(v) ? v[key] : undefined, o))).find(Boolean) ?? null;
const number = (v: unknown) => { const t = text(v); if (!t) return null; const n = Number(t.replace(/[,₪\s]/g, '')); return Number.isFinite(n) && n >= 0 ? n : null; };
export function sourceUrl(value: unknown, base: string): string | null {
  const t = text(value);
  if (!t || (!t.startsWith('/') && !/^https?:\/\//i.test(t))) return null;
  try { const u = new URL(t, base); return u.protocol === 'https:' && /(^|\.)yad2\.co\.il$/i.test(u.hostname) ? u.href : null; } catch { return null; }
}
export function imagesOf(o: unknown): string[] {
  const out = new Set<string>();
  const walk = (v: unknown, imageContext = false, depth = 0) => {
    if (depth > 18) return;
    if (typeof v === 'string' && imageContext && /^https?:\/\//i.test(v)) out.add(v);
    else if (Array.isArray(v)) v.forEach(x => walk(x, imageContext, depth + 1));
    else if (record(v)) Object.entries(v).forEach(([k, x]) => walk(x, /image|photo|gallery|thumbnail|cover|logo/i.test(k) || (imageContext && /src|url/.test(k)), depth + 1));
  };
  walk(o);
  return [...out];
}
export function extractDeveloper(payloads: unknown[], base: string) {
  const projects = new Map<string, any>();
  let developer = { company_name: null as string | null, phone: null as string | null, logo_url: null as string | null };
  const walk = (v: unknown, context = '', depth = 0) => {
    if (depth > 24) return;
    if (Array.isArray(v)) { v.forEach(x => walk(x, context, depth + 1)); return; }
    if (!record(v)) return;
    if (/^(developer|company|developerDetails)$/i.test(context)) developer = {
      company_name: pick(v, ['companyName', 'name', 'title']) ?? developer.company_name,
      phone: pick(v, ['phone', 'phoneNumber', 'contactPhone']) ?? developer.phone,
      logo_url: pick(v, ['logo.url', 'logo', 'logoUrl', 'image.url', 'image']) ?? developer.logo_url,
    };
    const name = pick(v, ['projectName', 'project_name', 'title', 'name']);
    const isProject = name && !/developer|company/i.test(String(v.__typename ?? '')) && (v.projectName != null || v.projectId != null || /^(projects|project|projectDetails|developerProjects)$/i.test(context));
    if (isProject) {
      const hierarchy = extractProjectHierarchy(v);
      const apts = hierarchy.apartments;
      const p = { source_project_id: pick(v, ['projectId', 'project_id', 'id', 'token', 'slug']), name,
        city: pick(v, ['city.text', 'cityName', 'city', 'address.city.text', 'address.city', 'location.city']),
        neighborhood: pick(v, ['neighborhood.text', 'neighborhood', 'address.neighborhood.text']), address: pick(v, ['fullAddress', 'address.street.text', 'street.text', 'street', 'streetName', 'address']),
        total_units: number(v.totalUnits ?? v.unitsCount ?? v.numberOfUnits ?? v.apartmentsCount ?? v.totalApartments), available_units: number(v.availableUnits ?? v.availableApartments ?? v.unitsForSale),
        price_from: number(v.priceFrom ?? v.minPrice ?? v.startingPrice), delivery_date: pick(v, ['deliveryDate', 'occupancyDate', 'entryDate', 'completionDate']),
        status: pick(v, ['projectStatus.text', 'projectStatus', 'status.text', 'status', 'stage']), description: pick(v, ['description', 'about', 'info']), images: imagesOf(v),
        source_url: sourceUrl(pick(v, ['projectUrl', 'url', 'link']), base), apartments: apts, buildings: hierarchy.buildings, source_details: { ...v, hierarchy } };
      const key = p.source_project_id ?? p.source_url ?? p.name;
      const old = projects.get(key);
      projects.set(key, old ? mergeProject(old, p) : p);
      return; // Units and nested metadata remain within their parent project.
    }
    Object.entries(v).forEach(([k, x]) => { if (!/related|recommendations|similar/i.test(k)) walk(x, k, depth + 1); });
  };
  payloads.forEach(p => walk(p));
  return { developer, projects: [...projects.values()] };
}
export function mergeProject(old: any, fresh: any) {
  const merged = { ...old };
  Object.entries(fresh).forEach(([k, v]) => { if (v != null && v !== '' && !Array.isArray(v)) merged[k] = v; });
  merged.images = [...new Set([...old.images, ...fresh.images])];
  const apts = new Map<string, any>();
  [...old.apartments, ...fresh.apartments].forEach(u => { const key = `${u.building_id ?? ''}:${u.source_unit_id ?? u.source_url ?? JSON.stringify(u)}`; apts.set(key, mergeSource(apts.get(key), u)); });
  merged.apartments = [...apts.values()];
  merged.buildings = mergeSource(old.buildings ?? [], fresh.buildings ?? []);
  merged.source_details = mergeSource(old.source_details, fresh.source_details);
  return merged;
}
export function readPage(html: string, base: string) {
  const payloads: unknown[] = [];
  for (const m of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)) {
    const t = (m[1] ?? '').trim();
    try { payloads.push(JSON.parse(t)); } catch {
      const start = t.indexOf('{'), end = t.lastIndexOf('}');
      if (start >= 0 && end > start) try { payloads.push(JSON.parse(t.slice(start, end + 1))); } catch { /* not structured JSON */ }
    }
  }
  const links = new Set<string>();
  for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) {
    const url = sourceUrl(m[1].replace(/&amp;/g, '&'), base);
    if (url && /\/yad1\/(?:project|projects)\/[^/?]+/i.test(new URL(url).pathname)) links.add(url.split('?')[0]);
  }
  const result = extractDeveloper(payloads, base);
  result.projects.forEach(p => { if (p.source_url) links.add(p.source_url); });
  return { ...result, links: [...links] };
}