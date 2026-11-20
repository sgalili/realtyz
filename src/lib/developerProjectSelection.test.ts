import { describe, expect, it } from 'vitest';
import type { DeveloperProject } from './developerProjectForm';
import { commissionForSelection, projectUnitSelectionKey, withoutSelectedUnits } from './developerProjectSelection';
import { emptyDeveloperFees, unitCommissionKey } from './developerCommissions';

const units = [{ source_unit_id: 'u1', building_id: 'b1', rooms: 4, images: [] }, { source_unit_id: 'u2', building_id: 'b1', rooms: 5, images: [] }];
const project = { id: 'p1', apartments: units, source_details: {}, commission_config: { defaults: emptyDeveloperFees(), overrides: {} } } as unknown as DeveloperProject;
const fees = { ...emptyDeveloperFees(), form: 25, whatsapp: 35, phone: 45, closing: { type: 'percent' as const, value: 0.5 } };

describe('developer project and unit selection', () => {
  it('sets defaults for a selected project without replacing unrelated unit overrides', () => {
    const original = { ...project, commission_config: { defaults: emptyDeveloperFees(), overrides: { other: emptyDeveloperFees() } } };
    const result = commissionForSelection(original, true, new Set(), fees);
    expect(result.defaults).toEqual(fees);
    expect(result.overrides?.other).toBeDefined();
  });

  it('sets overrides only for the selected apartments', () => {
    const selected = new Set([projectUnitSelectionKey(project.id, units[0] as never)]);
    const result = commissionForSelection(project, false, selected, fees);
    expect(result.overrides?.[unitCommissionKey(units[0] as never)]).toEqual(fees);
    expect(result.overrides?.[unitCommissionKey(units[1] as never)]).toBeUndefined();
    expect(result.defaults).toEqual(emptyDeveloperFees());
  });

  it('removes only selected apartments and leaves a reimport exclusion', () => {
    const selected = new Set([projectUnitSelectionKey(project.id, units[0] as never)]);
    const result = withoutSelectedUnits(project, selected);
    expect(result.apartments.map(unit => unit.source_unit_id)).toEqual(['u2']);
    expect((result.source_details.manual as { excluded_units: string[] }).excluded_units).toEqual([unitCommissionKey(units[0] as never)]);
  });
});
