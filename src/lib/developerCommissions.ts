import { sourceRecord, type ProjectUnit } from '../../supabase/functions/_shared/projectHierarchy';
import { savedProjectHierarchy } from './developerProjectBoard';
import { closingFeeAmount, closingFeeRange } from './closingFee';
export type DeveloperFees = { form: number | null; whatsapp: number | null; phone: number | null; caps: { form: number | null; whatsapp: number | null; phone: number | null }; closing: { type: 'fixed' | 'percent'; value: number | null } };
export type DeveloperCommissionConfig = { defaults?: DeveloperFees; overrides?: Record<string, DeveloperFees> };
export const emptyDeveloperFees = (): DeveloperFees => ({ form: null, whatsapp: null, phone: null, caps: { form: null, whatsapp: null, phone: null }, closing: { type: 'percent', value: null } });
export const unitCommissionKey = (unit: Pick<ProjectUnit, 'building_id' | 'source_unit_id'>) => JSON.stringify([unit.building_id ?? '', unit.source_unit_id]);
export function commissionConfig(value: unknown): DeveloperCommissionConfig { return sourceRecord(value) as DeveloperCommissionConfig; }
export function effectiveUnitFees(config: DeveloperCommissionConfig, unit?: ProjectUnit): DeveloperFees | undefined { return unit ? config.overrides?.[unitCommissionKey(unit)] ?? config.defaults : config.defaults; }
export function developerFeesErrors(fees: DeveloperFees | undefined, deal: string, price: number): string[] {
  if (!fees) return ['עמלות'];
  const missing: string[] = [];
  for (const [key, label] of [['form', 'טופס'], ['whatsapp', 'WhatsApp'], ['phone', 'טלפון']] as const) {
    if (!(Number(fees[key]) > 0) || !Number.isFinite(Number(fees[key]))) missing.push(`עמלת ${label}`);
    const cap = fees.caps?.[key];
    if (!(Number(cap) > 0) || !Number.isInteger(cap)) missing.push(`מגבלת ${label}`);
  }
  const amount = fees.closing?.value;
  if (!(Number(amount) > 0) || !Number.isFinite(Number(amount))) missing.push('סגירת עסקה');
  if (!(price > 0)) missing.push('מחיר');
  if (fees.closing?.type === 'percent' && Number(amount) > 0) {
    const range = closingFeeRange(deal, price);
    if (Number(amount) < range.min || Number(amount) > range.max) missing.push('טווח עמלת סגירה');
  }
  return missing;
}
export type UnitFeeSelector = { building?: string; rooms?: number; type?: string; unitKey?: string };
export function matchingCommissionUnits(units: ProjectUnit[], selector: UnitFeeSelector): ProjectUnit[] {
  return units.filter(unit => (!selector.building || unit.building_id === selector.building) && (selector.rooms == null || unit.rooms === selector.rooms) && (!selector.type || unit.type === selector.type) && (!selector.unitKey || unitCommissionKey(unit) === selector.unitKey));
}
export function assignDeveloperFees(config: DeveloperCommissionConfig, units: ProjectUnit[], selector: UnitFeeSelector, fees: DeveloperFees): DeveloperCommissionConfig {
  const scoped = Object.values(selector).some(value => value !== undefined && value !== '');
  if (!scoped) return { ...config, defaults: structuredClone(fees) };
  const overrides = { ...config.overrides };
  matchingCommissionUnits(units, selector).forEach(unit => { overrides[unitCommissionKey(unit)] = structuredClone(fees); });
  return { ...config, overrides };
}
export function projectCommissionErrors(project: { commission_config?: unknown; source_details?: unknown; apartments?: unknown; price_from?: number | null }, unit?: ProjectUnit): string[] {
  const config = commissionConfig(project.commission_config);
  const details = sourceRecord(project.source_details);
  const deal = details.deal_type === 'rent' || sourceRecord(details.manual).deal_type === 'rent' ? 'rent' : 'sale';
  if (unit) return developerFeesErrors(effectiveUnitFees(config, unit), deal, unit.price ?? project.price_from ?? 0);
  return [...developerFeesErrors(config.defaults, deal, project.price_from ?? 0), ...savedProjectHierarchy(project).apartments.flatMap(u => developerFeesErrors(effectiveUnitFees(config, u), deal, u.price ?? project.price_from ?? 0).map(error => `${u.source_unit_id}: ${error}`))];
}
export function developerClosingAmount(fees: DeveloperFees, price: number) { return fees.closing.type === 'percent' ? closingFeeAmount(Number(fees.closing.value), price) : Number(fees.closing.value); }