import { extractProjectHierarchy, mergeSource, savedProjectHierarchy, sourceRecord } from './projectHierarchy.ts';

type RecordValue = Record<string, any>;
const record = (v: unknown): v is RecordValue => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): string | null => typeof v === 'string' || typeof v === 'number' ? String(v).trim() || null : null;
const pick = (o: RecordValue, keys: string[]) => keys.map(k => text(k.split('.').reduce<any>((v, key) => record(v) ? v[key] : undefined, o))).find(Boolean) ?? null;
const number = (v: unknown) => { const t = text(v); if (!t) return null; const n = Number(t.replace(/[,₪\s‏‎]/g, '')); return Number.isFinite(n) && n >= 0 ? n : null; };
const PROJECT_PATH = /^\/yad1\/(?:project|projects)\/[^/]+\/?$/i;
const DEVELOPER_PATH = /^\/yad1\/developers\/[^/]+\/?$/i;

export function developerImportPageKind(value: string): 'profile' | 'project' | null {
  const raw = value.trim().match(/(?:https?:\/\/)?(?:[a-z0-9-]+\.)*yad2\.co\.il\/[^\s<>]+/i)?.[0];
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (url.protocol !== 'https:' || !/(^|\.)yad2\.co\.il$/i.test(url.hostname)) return null;
    if (DEVELOPER_PATH.test(url.pathname)) return 'profile';
    if (PROJECT_PATH.test(url.pathname)) return 'project';
    return null;
  } catch { return null; }
}

export function developerImportUrl(value: string): string | null {
  const raw = value.trim().match(/(?:https?:\/\/)?(?:[a-z0-9-]+\.)*yad2\.co\.il\/[^\s<>]+/i)?.[0];
  if (!raw || !developerImportPageKind(raw)) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
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

function sourceTimeline(row: RecordValue) {
  const candidate = row.timeline ?? row.projectTimeline ?? row.statusTimeline ?? row.constructionTimeline ?? row.milestones ?? row.projectMilestones ?? row.constructionStages ?? row.projectStages;
  const values = Array.isArray(candidate) ? candidate : record(candidate) ? Object.entries(candidate).map(([label, value]) => record(value) ? { label, ...value } : { label, value }) : [];
  const timeline = values.flatMap((entry: unknown) => {
    if (typeof entry === 'string' || typeof entry === 'number') return [{ label: String(entry) }];
    if (!record(entry)) return [];
    const label = pick(entry, ['label', 'title', 'name', 'text', 'milestone', 'stage.text', 'stage', 'status.text', 'status']);
    const date = pick(entry, ['date', 'displayDate', 'deliveryDate', 'occupancyDate', 'completedAt', 'value']);
    const status = pick(entry, ['state.text', 'state', 'statusText', 'status.text']);
    const current = typeof entry.current === 'boolean' ? entry.current : typeof entry.isCurrent === 'boolean' ? entry.isCurrent : undefined;
    const completed = typeof entry.completed === 'boolean' ? entry.completed : typeof entry.isCompleted === 'boolean' ? entry.isCompleted : undefined;
    return label || date || status ? [{ ...(label ? { label } : {}), ...(date ? { date } : {}), ...(status ? { status } : {}), ...(current == null ? {} : { current }), ...(completed == null ? {} : { completed }) }] : [];
  });
  if (timeline.length) return timeline;
  const code = text(row.timelineStatus ?? row.additionalDetails?.timelineStatus);
  return code ? [{ source_code: code }] : [];
}

function cleanProjectName(value: string) {
  return value.split('|')[0].replace(/^פרויקט\s+/, '').trim();
}

function jsonLdProject(payload: unknown, base: string): unknown {
  if (!record(payload) || payload['@type'] !== 'RealEstateListing' || !record(payload.mainEntity)) return payload;
  const complex = payload.mainEntity;
  const provider = record(payload.provider) ? payload.provider : null;
  const url = sourceUrl(payload.url ?? complex.url, base);
  const sourceId = url?.match(/\/yad1\/(?:project|projects)\/([^/?]+)/i)?.[1] ?? null;
  const name = pick(complex, ['name']) ?? pick(payload, ['name']);
  return {
    project: {
      ...complex,
      projectName: name ? cleanProjectName(name) : null,
      projectId: sourceId,
      projectYzerId: sourceId,
      projectUrl: url,
      images: payload.image ?? complex.image ?? [],
      description: payload.description ?? complex.description,
      companyDetails: provider ? [provider] : [],
    },
  };
}

export function extractDeveloper(payloads: unknown[], base: string) {
  const projects = new Map<string, any>();
  let developer = { company_name: null as string | null, phone: null as string | null, logo_url: null as string | null, bio: null as string | null };
  const walk = (v: unknown, context = '', depth = 0) => {
    if (depth > 24) return;
    if (Array.isArray(v)) { v.forEach(x => walk(x, context, depth + 1)); return; }
    if (!record(v)) return;
    const row: RecordValue = record(v.metaData) && /^(projects|project|projectDetails|developerProjects)$/i.test(context) ? { ...v, ...v.metaData } : v;
    const captureDeveloper = (company: RecordValue) => { developer = {
      company_name: pick(company, ['companyName', 'company_name', 'developerName', 'developer_name', 'businessName', 'contractorName', 'name', 'title']) ?? developer.company_name,
      phone: pick(company, ['phone', 'phoneNumber', 'contactPhone', 'telephone']) ?? developer.phone,
      logo_url: pick(company, ['logo.url', 'logo', 'logoUrl', 'image.url', 'image']) ?? developer.logo_url,
      bio: pick(company, ['biography', 'about', 'description', 'info'])?.slice(0, 5000) ?? developer.bio,
    }; };
    if (/^(developer|company|developerDetails|companyDetails|developerInfo|companyInfo|projectDeveloper|contractor|entrepreneur|provider|organization)$/i.test(context)) captureDeveloper(row);
    for (const key of ['companyDetails', 'developerDetails', 'companyInfo', 'developerInfo', 'projectDeveloper', 'contractor', 'provider']) {
      const value = row[key];
      if (Array.isArray(value)) value.filter(record).forEach(captureDeveloper);
      else if (record(value)) captureDeveloper(value);
    }
    const name = pick(row, ['projectName', 'project_name', 'title', 'name']);
    const isProject = name && !/developer|company/i.test(String(row.__typename ?? '')) && (row.projectName != null || row.projectId != null || /^(projects|project|projectDetails|developerProjects)$/i.test(context));
    if (isProject) {
      const hierarchy = extractProjectHierarchy(row);
      const apts = hierarchy.apartments;
      const sourceId = pick(row, ['projectYzerId', 'token', 'projectId', 'project_id', 'id', 'slug']);
      const sourceStatus = pick(row, ['projectStatus.text', 'projectStatusText', 'statusText', 'constructionStatus.text', 'constructionStatus', 'projectStage.text', 'projectStage', 'additionalDetails.projectStatus.text', 'additionalDetails.projectStatus', 'projectStatus', 'status.text', 'status', 'stage']);
      const p = { source_project_id: sourceId, name,
        city: pick(row, ['city.text', 'cityName', 'city', 'address.city.text', 'address.city', 'address.addressLocality', 'location.city']),
        neighborhood: pick(row, ['neighborhood.text', 'neighborhood', 'address.neighborhood.text', 'address.addressRegion']), address: pick(row, ['fullAddress', 'address.display', 'address.streetAddress', 'address.street.text', 'street.text', 'street', 'streetName', 'address']),
        total_units: number(row.totalUnits ?? row.unitsCount ?? row.numberOfUnits ?? row.apartmentsCount ?? row.totalApartments ?? row.numberOfAccommodationUnits ?? (typeof row.apartments === 'number' ? row.apartments : null)), available_units: number(row.availableUnits ?? row.availableApartments ?? row.unitsForSale),
        price_from: number(row.priceFrom ?? row.minPrice ?? row.startingPrice ?? row.additionalDetails?.minPrice), delivery_date: pick(row, ['deliveryDate', 'occupancyDate', 'entryDate', 'completionDate', 'additionalDetails.entranceDate']),
        status: sourceStatus, source_status: sourceStatus, timeline: sourceTimeline(row), description: pick(row, ['description', 'about', 'info']), images: imagesOf(row),
        source_url: sourceUrl(pick(row, ['projectUrl', 'url', 'link']), base) ?? (sourceId ? `https://www.yad2.co.il/yad1/project/${encodeURIComponent(sourceId)}` : null), apartments: apts, buildings: hierarchy.buildings, source_details: { ...row, hierarchy } };
      const key = p.source_project_id ?? p.source_url ?? p.name;
      const old = projects.get(key);
      projects.set(key, old ? mergeProject(old, p) : p);
      return;
    }
    Object.entries(row).forEach(([k, x]) => { if (!/related|recommendations|similar/i.test(k)) walk(x, k, depth + 1); });
  };
  payloads.forEach(p => walk(jsonLdProject(p, base)));
  return { developer, projects: [...projects.values()] };
}

const decodeHtml = (value: string) => value.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x27;/g, "'").replace(/&rlm;|&lrm;|&rlm;/g, '').replace(/[‏‎]/g, '');
const htmlValue = (html: string, testId: string) => {
  const match = html.match(new RegExp(`<[^>]+data-testid=["']${testId}["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'i'));
  return match ? decodeHtml(match[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim() : null;
};
const pageTitle = (html: string) => decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim();

function extractRenderedHtml(html: string, base: string) {
  const kind = developerImportPageKind(base);
  const title = pageTitle(html);
  const developer = { company_name: null as string | null, phone: null as string | null, logo_url: null as string | null, bio: null as string | null };
  if (kind === 'profile' && title) developer.company_name = title.split('|')[0].replace(/^חברת\s+/, '').trim() || null;
  if (kind === 'project' && title.includes('|')) developer.company_name = title.split('|').slice(1).join('|').trim() || null;
  const cards: RecordValue[] = [];
  for (const match of html.matchAll(/<li[^>]+data-testid=["']feed-project-card["'][^>]*>([\s\S]*?)<\/li>/gi)) {
    const card = match[1];
    const name = htmlValue(card, 'feed-project-label');
    const href = sourceUrl(card.match(/<a[^>]+href=["']([^"']+)["']/i)?.[1]?.replace(/&amp;/g, '&'), base);
    if (!name || !href) continue;
    const address = htmlValue(card, 'feed-project-subtitle');
    const image = card.match(/<img[^>]+class=["'][^"']*mainImage[^"']*["'][^>]+src=["']([^"']+)["']/i)?.[1] ?? card.match(/<img[^>]+src=["']([^"']+)["'][^>]+class=["'][^"']*mainImage/i)?.[1] ?? null;
    cards.push({ projectName: name, projectId: href.match(/\/yad1\/(?:project|projects)\/([^/?]+)/i)?.[1], projectUrl: href, address: { display: address, city: address?.split(',').at(-1)?.trim() }, priceFrom: htmlValue(card, 'feed-project-value'), images: image ? [image] : [], projectStatusText: htmlValue(card, 'feed-project-status') });
  }
  const parsed = extractDeveloper([{ projects: cards }], base);
  const timeline: { label: string; completed: boolean }[] = [];
  const statusSection = html.match(/<section[^>]+data-testid=["']project-building-status["'][^>]*>([\s\S]*?)<\/section>/i)?.[1] ?? '';
  for (const match of statusSection.matchAll(/<div[^>]+data-testid=["']building-status-step-[^"']+["'][^>]*>([\s\S]*?)<\/div>/gi)) {
    const label = decodeHtml(match[1].match(/<span[^>]*>([\s\S]*?)<\/span>/i)?.[1]?.replace(/<[^>]+>/g, ' ') ?? '').replace(/\s+/g, ' ').trim();
    if (label) timeline.push({ label, completed: /data-completed=["']true["']/i.test(match[0]) });
  }
  return { developer, projects: parsed.projects, timeline };
}

export function mergeProject(old: any, fresh: any) {
  const merged = { ...old };
  Object.entries(fresh).forEach(([k, v]) => { if (v != null && v !== '' && !Array.isArray(v)) merged[k] = v; });
  merged.images = [...new Set([...(old.images ?? []), ...(fresh.images ?? [])])];
  merged.timeline = fresh.timeline?.length ? fresh.timeline : old.timeline ?? [];
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
    if (url && PROJECT_PATH.test(new URL(url).pathname)) links.add(url.split('?')[0]);
  }
  const result = extractDeveloper(payloads, base);
  const rendered = extractRenderedHtml(html, base);
  result.developer.company_name ??= rendered.developer.company_name;
  result.developer.phone ??= rendered.developer.phone;
  result.developer.logo_url ??= rendered.developer.logo_url;
  result.developer.bio ??= rendered.developer.bio;
  for (const project of rendered.projects) {
    const old = result.projects.find(p => (project.source_project_id && p.source_project_id === project.source_project_id) || (project.source_url && p.source_url === project.source_url));
    if (old) Object.assign(old, mergeProject(old, project));
    else result.projects.push(project);
  }
  if (rendered.timeline.length) {
    const canonicalBase = developerImportUrl(base);
    for (const project of result.projects) {
      if (developerImportPageKind(base) === 'project' || project.source_url === canonicalBase) project.timeline = rendered.timeline;
    }
  }
  result.projects.forEach(p => { if (p.source_url) links.add(p.source_url); });
  return { ...result, links: [...links], timeline: rendered.timeline };
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

export function developerQueuePhaseAfterPage(work: DeveloperQueueWork) {
  if (work.accountId) return 'developer_saving';
  return work.developer.company_name || !work.pendingUrls.length ? 'developer_creating' : 'developer_scanning';
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
    source_status: project.source_status ?? project.status ?? old?.source_status ?? null,
    timeline: project.timeline?.length ? project.timeline : old?.timeline ?? [],
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
