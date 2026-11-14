import { extractProjectHierarchy, mergeSource, savedProjectHierarchy, sourceRecord } from './projectHierarchy.ts';

type RecordValue = Record<string, any>;
const record = (v: unknown): v is RecordValue => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): string | null => typeof v === 'string' || typeof v === 'number' ? String(v).trim() || null : null;
const pick = (o: RecordValue, keys: string[]) => keys.map(k => text(k.split('.').reduce<any>((v, key) => record(v) ? v[key] : undefined, o))).find(Boolean) ?? null;
const number = (v: unknown) => { const t = text(v); if (!t) return null; const n = Number(t.replace(/[,₪\s]/g, '')); return Number.isFinite(n) && n >= 0 ? n : null; };

export function developerImportUrl(value: string): string | null {
  const raw = value.trim().match(/(?:https?:\/\/)?(?:[a-z0-9-]+\.)*yad2\.co\.il\/[^\s<>]+/i)?.[0];
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (url.protocol !== 'https:' || !/(^|\.)yad2\.co\.il$/i.test(url.hostname) || !/^\/yad1\/developers\/[^/]+\/?$/i.test(url.pathname)) return null;
    url.hash = '';
    url.search = '';
    return url.href;
  } catch { return null; }
}

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
  let developer = { company_name: null as string | null, phone: null as string | null, logo_url: null as string | null, bio: null as string | null };
  const walk = (v: unknown, context = '', depth = 0) => {
    if (depth > 24) return;
    if (Array.isArray(v)) { v.forEach(x => walk(x, context, depth + 1)); return; }
    if (!record(v)) return;
    // Yad2's developer page keeps identity/location on the project wrapper and
    // the name/images/unit totals inside metaData. Read them as one project.
    const row: RecordValue = record(v.metaData) && /^(projects|project|projectDetails|developerProjects)$/i.test(context) ? { ...v, ...v.metaData } : v;
    const captureDeveloper = (company: RecordValue) => { developer = {
      company_name: pick(company, ['companyName', 'name', 'title']) ?? developer.company_name,
      phone: pick(company, ['phone', 'phoneNumber', 'contactPhone']) ?? developer.phone,
      logo_url: pick(company, ['logo.url', 'logo', 'logoUrl', 'image.url', 'image']) ?? developer.logo_url,
      bio: pick(company, ['biography', 'about', 'description', 'info'])?.slice(0, 5000) ?? developer.bio,
    }; };
    if (/^(developer|company|developerDetails|companyDetails)$/i.test(context)) captureDeveloper(row);
    if (Array.isArray(row.companyDetails)) row.companyDetails.filter(record).forEach(captureDeveloper);
    const name = pick(row, ['projectName', 'project_name', 'title', 'name']);
    const isProject = name && !/developer|company/i.test(String(row.__typename ?? '')) && (row.projectName != null || row.projectId != null || /^(projects|project|projectDetails|developerProjects)$/i.test(context));
    if (isProject) {
      const hierarchy = extractProjectHierarchy(row);
      const apts = hierarchy.apartments;
      const sourceId = pick(row, ['projectYzerId', 'token', 'projectId', 'project_id', 'id', 'slug']);
      const p = { source_project_id: sourceId, name,
        city: pick(row, ['city.text', 'cityName', 'city', 'address.city.text', 'address.city', 'location.city']),
        neighborhood: pick(row, ['neighborhood.text', 'neighborhood', 'address.neighborhood.text']), address: pick(row, ['fullAddress', 'address.display', 'address.street.text', 'street.text', 'street', 'streetName', 'address']),
        total_units: number(row.totalUnits ?? row.unitsCount ?? row.numberOfUnits ?? row.apartmentsCount ?? row.totalApartments ?? (typeof row.apartments === 'number' ? row.apartments : null)), available_units: number(row.availableUnits ?? row.availableApartments ?? row.unitsForSale),
        price_from: number(row.priceFrom ?? row.minPrice ?? row.startingPrice ?? row.additionalDetails?.minPrice), delivery_date: pick(row, ['deliveryDate', 'occupancyDate', 'entryDate', 'completionDate', 'additionalDetails.entranceDate']),
        status: pick(row, ['projectStatus.text', 'projectStatus', 'status.text', 'status', 'stage']), description: pick(row, ['description', 'about', 'info']), images: imagesOf(row),
        source_url: sourceUrl(pick(row, ['projectUrl', 'url', 'link']), base) ?? (sourceId ? `https://www.yad2.co.il/yad1/project/${encodeURIComponent(sourceId)}` : null), apartments: apts, buildings: hierarchy.buildings, source_details: { ...row, hierarchy } };
      const key = p.source_project_id ?? p.source_url ?? p.name;
      const old = projects.get(key);
      projects.set(key, old ? mergeProject(old, p) : p);
      return;
    }
    Object.entries(row).forEach(([k, x]) => { if (!/related|recommendations|similar/i.test(k)) walk(x, k, depth + 1); });
  };
  payloads.forEach(p => walk(p));
  return { developer, projects: [...projects.values()] };
}

export function mergeProject(old: any, fresh: any) {
  const merged = { ...old };
  Object.entries(fresh).forEach(([k, v]) => { if (v != null && v !== '' && !Array.isArray(v)) merged[k] = v; });
  merged.images = [...new Set([...(old.images ?? []), ...(fresh.images ?? [])])];
  const apts = new Map<string, any>();
  [...(old.apartments ?? []), ...(fresh.apartments ?? [])].forEach(u => { const key = `${u.building_id ?? ''}:${u.source_unit_id ?? u.source_url ?? JSON.stringify(u)}`; apts.set(key, mergeSource(apts.get(key), u)); });
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

export type DeveloperQueueWork = {
  url: string;
  expectedProjects: number;
  developer: { company_name: string | null; phone: string | null; logo_url: string | null; bio: string | null };
  projects: any[];
  pendingUrls: string[];
  visitedUrls: string[];
  dirtyProjectKeys: string[];
  accountId?: string;
  developerId?: string;
};

export function newDeveloperQueueWork(url: string, expectedProjects: number): DeveloperQueueWork {
  return { url, expectedProjects, developer: { company_name: null, phone: null, logo_url: null, bio: null }, projects: [], pendingUrls: [url], visitedUrls: [], dirtyProjectKeys: [] };
}

const projectKey = (project: any) => String(project.source_project_id ?? project.source_url ?? project.name);
const sameProject = (old: any, fresh: any) =>
  (fresh.source_project_id && old.source_project_id === fresh.source_project_id) ||
  (fresh.source_url && old.source_url === fresh.source_url) ||
  (old.name === fresh.name && (old.city ?? null) === (fresh.city ?? null));

/** Merge one own developer/project page into the durable checkpoint. */
export function mergeDeveloperQueuePage(work: DeveloperQueueWork, page: { source_url: string; developer: Partial<DeveloperQueueWork['developer']>; projects: any[]; links: string[] }) {
  for (const key of ['company_name', 'phone', 'logo_url', 'bio'] as const) {
    const value = page.developer?.[key];
    if (value != null && value !== '') work.developer[key] = value;
  }
  for (const project of page.projects ?? []) {
    const index = work.projects.findIndex(old => sameProject(old, project));
    if (index >= 0) work.projects[index] = mergeProject(work.projects[index], project);
    else work.projects.push(project);
    const key = projectKey(project);
    if (!work.dirtyProjectKeys.includes(key)) work.dirtyProjectKeys.push(key);
  }
  if (!work.visitedUrls.includes(page.source_url)) work.visitedUrls.push(page.source_url);
  work.pendingUrls = work.pendingUrls.filter(url => url !== page.source_url);
  for (const link of page.links ?? []) {
    if (!work.visitedUrls.includes(link) && !work.pendingUrls.includes(link)) work.pendingUrls.push(link);
  }
  return work;
}

/** Preserve private/manual state while refreshing source-owned project facts. */
export function developerProjectImportRow(old: Record<string, any> | undefined, project: any, developerId: string, accountId: string): Record<string, any> {
  const fresh = {
    workspace_owner_id: accountId, developer_id: developerId, name: project.name, city: project.city ?? null,
    neighborhood: project.neighborhood ?? null, address: project.address ?? null, total_units: project.total_units ?? null,
    available_units: project.available_units ?? null, price_from: project.price_from ?? null, delivery_date: project.delivery_date ?? null,
    description: project.description ?? null, image_url: project.images?.[0] ?? old?.image_url ?? null,
    images: project.images?.length ? project.images : old?.images ?? [], apartments: project.apartments?.length ? project.apartments : old?.apartments ?? [],
    source_url: project.source_url ?? old?.source_url ?? null, source_details: project.source_details ?? old?.source_details ?? {},
    source_project_id: old?.source_project_id ?? projectKey(project), status: old?.status ?? 'marketing', is_public: old?.is_public ?? false,
    commission_config: old?.commission_config ?? {},
  };
  const merged = mergeSource(old, fresh) as Record<string, any>;
  const manual = sourceRecord(sourceRecord(old?.source_details).manual);
  const overrides = sourceRecord(manual.project_overrides);
  return { ...merged, ...overrides, commission_config: old?.commission_config ?? {}, source_details: { ...sourceRecord(merged.source_details), manual: { ...sourceRecord(sourceRecord(merged.source_details).manual), ...manual } } };
}

export function detailedUnitCount(project: Record<string, any>) {
  return savedProjectHierarchy(project).apartments.length;
}
