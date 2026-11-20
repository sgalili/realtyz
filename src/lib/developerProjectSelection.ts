import type { DeveloperProject } from './developerProjectForm';
import { savedProjectHierarchy } from './developerProjectBoard';
import { commissionConfig, unitCommissionKey, type DeveloperFees } from './developerCommissions';
import { sourceRecord, type ProjectUnit } from '../../supabase/functions/_shared/projectHierarchy';

export const projectUnitSelectionKey = (projectId: string, unit: Pick<ProjectUnit, 'building_id' | 'source_unit_id'>) => `${projectId}:${unitCommissionKey(unit)}`;

export function commissionForSelection(project: DeveloperProject, wholeProject: boolean, selectedUnits: Set<string>, fees: DeveloperFees) {
  const current = commissionConfig(project.commission_config);
  const next = { ...current };
  if (wholeProject) next.defaults = structuredClone(fees);
  const overrides = { ...current.overrides };
  for (const unit of savedProjectHierarchy(project).apartments) {
    if (selectedUnits.has(projectUnitSelectionKey(project.id, unit))) overrides[unitCommissionKey(unit)] = structuredClone(fees);
  }
  if (selectedUnits.size) next.overrides = overrides;
  return next;
}

/** Deleted units stay excluded when a later source import contains them again. */
export function withoutSelectedUnits(project: DeveloperProject, selectedUnits: Set<string>) {
  const manual = sourceRecord(sourceRecord(project.source_details).manual);
  const excluded = new Set((Array.isArray(manual.excluded_units) ? manual.excluded_units : []).filter((key): key is string => typeof key === 'string'));
  const units = savedProjectHierarchy(project).apartments;
  const kept = units.filter(unit => !selectedUnits.has(projectUnitSelectionKey(project.id, unit)));
  units.forEach(unit => { if (selectedUnits.has(projectUnitSelectionKey(project.id, unit))) excluded.add(unitCommissionKey(unit)); });
  const overrides = { ...commissionConfig(project.commission_config).overrides };
  excluded.forEach(key => { delete overrides[key]; });
  return {
    apartments: kept,
    commission_config: { ...commissionConfig(project.commission_config), overrides },
    source_details: { ...sourceRecord(project.source_details), manual: { ...manual, excluded_units: [...excluded] } },
  };
}
