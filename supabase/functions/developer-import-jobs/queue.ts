import { mergeProject } from '../_shared/yad2DeveloperImport.ts';

export const MAX_PAGE_ATTEMPTS = 5;

export function developerRetryDelay(attempt: number, providerDelay = 0, rateLimited = false) {
  const exponential = Math.min(15 * 60_000, 15_000 * 2 ** Math.max(0, attempt - 1));
  return Math.max(exponential, providerDelay, rateLimited ? 300_000 : 0);
}

export function mergeProjectPage(base: any[], fresh: any[]) {
  const result = [...(base ?? [])];
  for (const project of fresh ?? []) {
    const index = result.findIndex(old =>
      (project.source_project_id && old.source_project_id === project.source_project_id) ||
      (project.source_url && old.source_url === project.source_url) ||
      (old.name === project.name && (old.city ?? null) === (project.city ?? null)));
    if (index >= 0) result[index] = mergeProject(result[index], project);
    else result.push(project);
  }
  if (!fresh?.length && result.length) return result;
  return result;
}

export function projectPageRows(sourceUrl: string, projects: any[], links: string[]) {
  const rows: { url: string; kind: 'project'; fetch_required: boolean; payload: { projects: any[] } }[] = [];
  const used = new Set<string>();
  for (const link of [...new Set(links)]) {
    const url = link.split('?')[0];
    const initial = (projects ?? []).filter(project => project.source_url === url || project.source_url?.split('?')[0] === url);
    rows.push({ url, kind: 'project', fetch_required: true, payload: { projects: initial } });
    used.add(url);
  }
  for (const project of projects ?? []) {
    const url = project.source_url?.split('?')[0];
    if (url && used.has(url)) continue;
    const key = String(project.source_project_id ?? project.source_url ?? project.name);
    const synthetic = `${sourceUrl}#project-${encodeURIComponent(key)}`;
    if (used.has(synthetic)) continue;
    rows.push({ url: synthetic, kind: 'project', fetch_required: false, payload: { projects: [project] } });
    used.add(synthetic);
  }
  return rows;
}

export function safeImportError(value: unknown) {
  const message = value instanceof Error ? value.message : String(value ?? 'unknown');
  return message.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').replace(/https?:\/\/\S+/gi, '[url]').slice(0, 300);
}
