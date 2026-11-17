import { savedProjectHierarchy } from './developerProjectBoard';
import { projectCommissionErrors } from './developerCommissions';

type ProjectInput = Parameters<typeof savedProjectHierarchy>[0] & { is_public?: boolean | null; status?: string | null; source_status?: string | null; timeline?: unknown; price_from?: number | null; commission_config?: unknown };

/** Fields a developer still has to fill before the project can be published. */
export function missingProjectDetails(p: ProjectInput, hasImages: boolean): string[] {
  const missing: string[] = [];
  const timeline = Array.isArray(p.timeline) ? p.timeline : [];
  if (!p.source_status && timeline.length === 0) missing.push('שלב בפרויקט');
  if (!(Number(p.price_from) > 0)) missing.push('מחיר');
  if (!hasImages) missing.push('תמונות');
  const units = savedProjectHierarchy(p).apartments;
  if (units.length === 0) missing.push('דירות');
  const noPrice = units.filter(u => !(Number(u.price) > 0)).length;
  const noSqm = units.filter(u => !(Number(u.size_sqm) > 0)).length;
  const noSpecs = units.filter(u => u.rooms == null).length;
  if (noPrice) missing.push(`מחיר ל-${noPrice} דירות`);
  if (noSqm) missing.push(`מ"ר ל-${noSqm} דירות`);
  if (noSpecs) missing.push(`חדרים ל-${noSpecs} דירות`);
  if (projectCommissionErrors(p).length) missing.push('עמלות');
  return missing;
}

export function projectPublicationLabel(p: ProjectInput): 'מפורסם' | 'טיוטה' {
  return p.is_public ? 'מפורסם' : 'טיוטה';
}
