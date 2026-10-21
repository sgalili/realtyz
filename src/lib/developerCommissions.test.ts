import { describe, expect, it } from 'vitest';
import { assignDeveloperFees, developerFeesErrors, effectiveUnitFees, unitCommissionKey, type DeveloperFees } from './developerCommissions';
import { extractProjectHierarchy } from '../../supabase/functions/_shared/projectHierarchy';
import { projectForm, projectPayload, type DeveloperProject, type DeveloperCompany } from './developerProjectForm';
import { mergeImportedProject } from './developerProjectBoard';
const fees: DeveloperFees = { form: 10, whatsapp: 20, phone: 30, caps: { form: 1, whatsapp: 2, phone: 3 }, closing: { type: 'percent', value: 1 } };
const units = extractProjectHierarchy({ buildings: [{ id: 'a', units: [{ id: '1', rooms: 4, type: 'דירה' }, { id: '2', rooms: 3 }] }, { id: 'b', units: [{ id: '1', rooms: 4, type: 'דירה' }] }] }).apartments;
describe('mandatory developer fees', () => {
  it('inherits company fees, caps and questions only where project defaults are missing', () => {
    const defaults = { ...fees, questions: ['מתי תרצו לרכוש?'], questions_phone: ['מה התקציב?'], form_fields: [{ id: 'budget', label: 'תקציב', type: 'number', required: true }] };
    const company = { commission_config: { defaults } } as unknown as DeveloperCompany;
    expect(projectForm(undefined, company).commission_config.defaults).toEqual(defaults);
    const original = { commission_config: { defaults: { ...fees, form: 45 }, overrides: { [unitCommissionKey(units[0])]: { ...fees, phone: 65 } } } } as unknown as DeveloperProject;
    const restored = projectForm(original, company);
    expect(restored.commission_config.defaults?.form).toBe(45);
    expect(effectiveUnitFees(restored.commission_config, units[0])?.phone).toBe(65);
  });
  it('preserves shared screening and form fields on bulk assignment and save', () => {
    const configured = { ...fees, questions: ['אזור מועדף?'], questions_phone: ['מועד רכישה?'], form_fields: [{ id: 'budget', label: 'תקציב', type: 'number' as const, required: true }] };
    const config = assignDeveloperFees({}, units, {}, configured);
    const original = { commission_config: config, apartments: units } as unknown as DeveloperProject;
    expect(projectPayload(projectForm(original), original).commission_config.defaults).toEqual(configured);
  });
  it.each(['form', 'whatsapp', 'phone'] as const)('requires a positive %s fee', key => { expect(developerFeesErrors({ ...fees, [key]: 0 }, 'sale', 2000000)).not.toEqual([]); expect(developerFeesErrors(fees, 'sale', 2000000)).toEqual([]); });
  it.each(['form', 'whatsapp', 'phone'] as const)('requires an integer 24-hour %s cap', key => { for (const value of [null, 0, 1.5]) expect(developerFeesErrors({ ...fees, caps: { ...fees.caps, [key]: value } }, 'sale', 2000000)).not.toEqual([]); });
  it('requires closing fees and exact sale/rent ranges', () => { for (const [deal, allowed, forbidden] of [['sale', [0.2, 2], [0, 0.19, 2.01]], ['rent', [10, 100], [0, 9.99, 100.01]]] as const) { for (const value of allowed) expect(developerFeesErrors({ ...fees, closing: { type: 'percent', value } }, deal, 6000)).toEqual([]); for (const value of forbidden) expect(developerFeesErrors({ ...fees, closing: { type: 'percent', value } }, deal, 6000)).not.toEqual([]); } });
  it('assigns by room count, building and type without changing other units', () => { const config = assignDeveloperFees({ defaults: fees }, units, { building: 'a', rooms: 4, type: 'דירה' }, { ...fees, form: 40 }); expect(effectiveUnitFees(config, units[0])?.form).toBe(40); expect(effectiveUnitFees(config, units[1])?.form).toBe(10); expect(effectiveUnitFees(config, units[2])?.form).toBe(10); });
  it('retains individual overrides when defaults change and disambiguates repeated IDs', () => { const config = assignDeveloperFees({ defaults: fees }, units, { unitKey: unitCommissionKey(units[2]) }, { ...fees, phone: 50 }); const next = assignDeveloperFees(config, units, {}, { ...fees, phone: 60 }); expect(effectiveUnitFees(next, units[0])?.phone).toBe(60); expect(effectiveUnitFees(next, units[2])?.phone).toBe(50); });
  it('preserves settings through save/reload and Yad2 reimport', () => { const config = assignDeveloperFees({ defaults: fees }, units, { rooms: 4 }, { ...fees, form: 40 }); const original = { name: 'פרויקט', commission_config: config, apartments: units, source_details: {} } as unknown as DeveloperProject; const saved = projectPayload(projectForm(original), original); const fresh = mergeImportedProject(saved, { commission_config: {}, apartments: [] }); const restored = projectForm(fresh as unknown as DeveloperProject); expect(restored.commission_config).toEqual(config); });
});