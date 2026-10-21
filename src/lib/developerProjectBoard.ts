import { savedProjectHierarchy, sourceRecord, mergeSource } from '../../supabase/functions/_shared/projectHierarchy';
import { matchesPropertyFilter, type PropertyFilterState } from './leadTypeFilter';
export { savedProjectHierarchy };
export function developerProjectImages(project: { images?: unknown; image_url?: string | null; source_details?: unknown }) {
  const details = sourceRecord(project.source_details);
  const cover = typeof details.coverImage === 'string' ? details.coverImage : sourceRecord(details.coverImage).url;
  const gallery = [...new Set([...(typeof cover === 'string' ? [cover] : []), ...(Array.isArray(details.images) ? details.images.filter((image): image is string => typeof image === 'string') : []), ...(Array.isArray(project.images) ? project.images.filter((image): image is string => typeof image === 'string') : []), ...(project.image_url ? [project.image_url] : [])])];
  const photos = gallery.filter(image => !/\/(?:logo|logos)\//i.test(image) && image !== details.projectLogo && image !== sourceRecord(details.companyDetails).logo);
  return photos.length ? photos : gallery;
}
export function projectDeal(project: { source_details?: unknown }) {
  const details = sourceRecord(project.source_details);
  return (details.deal_type ?? sourceRecord(details.manual).deal_type) === 'rent' ? 'rent' : 'sale';
}
export function projectMatches(project: { name: string; city?: string | null; neighborhood?: string | null; address?: string | null; price_from?: number | null; apartments?: unknown; source_details?: unknown }, query: string, deals: { sale: boolean; rent: boolean }, filters: PropertyFilterState) {
  const deal = projectDeal(project);
  if (!deals[deal]) return false;
  if (query.trim() && ![project.name, project.city, project.neighborhood, project.address].filter(Boolean).join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) return false;
  const units = savedProjectHierarchy(project).apartments;
  const base = { deal_type: deal, city: project.city, neighborhood: project.neighborhood };
  return units.length ? units.some(unit => matchesPropertyFilter({ ...base, ...unit, property_type: unit.type }, filters)) : matchesPropertyFilter({ ...base, price: project.price_from }, filters);
}
export function mergeImportedProject(old: Record<string, unknown> | undefined, fresh: Record<string, unknown>): Record<string, unknown> {
  const merged = mergeSource(old, fresh) as Record<string, unknown>;
  // Editing overrides remain authoritative when a later source page is sparse or changed.
  const manual = sourceRecord(sourceRecord(old?.source_details).manual);
  const overrides = sourceRecord(manual.project_overrides);
  return { ...merged, ...overrides, source_details: { ...sourceRecord(merged.source_details), manual: { ...sourceRecord(sourceRecord(merged.source_details).manual), ...manual } } };
}