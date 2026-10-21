import type { Tables } from '@/integrations/supabase/types';
import { savedProjectHierarchy } from '../../supabase/functions/_shared/projectHierarchy';
import { commissionConfig, type DeveloperCommissionConfig } from './developerCommissions';

export type DeveloperProject = Tables<'developer_projects'>;
export type DeveloperCompany = Tables<'developers'>;
export const PROJECT_STATUS: Record<string, string> = { pre_sale: 'טרום שיווק', marketing: 'בשיווק', construction: 'בבנייה', sold_out: 'אזל', delivered: 'נמסר' };
export const PROJECT_STEPS = ['פרטי החברה', 'פרטי הפרויקט', 'מיקום', 'שיווק ומסירה', 'תמהיל דירות', 'תמונות', 'מפרט', 'אישור'] as const;
export type UnitForm = Record<string, unknown> & { source_unit_id: string; type: string; rooms: string; floor: string; size_sqm: string; price: string; count: string; balcony_sqm: string; parking: string };
export type ProjectForm = {
  company_name: string; phone: string; company_source_url: string; logo_url: string;
  name: string; description: string; source_url: string; city: string; neighborhood: string; address: string;
  status: string; total_units: string; available_units: string; price_from: string; delivery_date: string;
  units: UnitForm[]; images: string[]; specifications: string; amenities: string[]; commission_config: DeveloperCommissionConfig; deal_type: 'sale' | 'rent';
};
const str = (v: unknown) => v == null ? '' : String(v);
export const asRecord = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
export const projectNumber = (v: string) => v.trim() ? Number(v.replace(/[,₪\s]/g, '')) : null;
export const newUnit = (): UnitForm => ({ source_unit_id: crypto.randomUUID(), type: '', rooms: '', floor: '', size_sqm: '', price: '', count: '', balcony_sqm: '', parking: '' });
export function projectForm(project?: DeveloperProject, company?: DeveloperCompany | null): ProjectForm {
  const details = asRecord(project?.source_details);
  const manual = asRecord(details.manual);
  return {
    commission_config: commissionConfig(project?.commission_config), deal_type: (details.deal_type ?? manual.deal_type) === 'rent' ? 'rent' : 'sale',
    company_name: company?.company_name ?? '', phone: company?.phone ?? '', company_source_url: company?.source_url ?? '', logo_url: company?.logo_url ?? '',
    name: project?.name ?? '', description: project?.description ?? '', source_url: project?.source_url ?? '', city: project?.city ?? '', neighborhood: project?.neighborhood ?? '', address: project?.address ?? '',
    status: project?.status ?? 'marketing', total_units: str(project?.total_units), available_units: str(project?.available_units), price_from: str(project?.price_from), delivery_date: project?.delivery_date ?? '',
    units: project ? savedProjectHierarchy(project).apartments.map(raw => { const u = asRecord(raw); return { ...u, source_unit_id: str(u.source_unit_id) || crypto.randomUUID(), type: str(u.type), rooms: str(u.rooms), floor: str(u.floor), size_sqm: str(u.size_sqm), price: str(u.price), count: str(u.count), balcony_sqm: str(u.balcony_sqm), parking: str(u.parking) }; }) : [],
    images: Array.isArray(project?.images) ? project.images.filter((v): v is string => typeof v === 'string') : project?.image_url ? [project.image_url] : [],
    specifications: str(manual.specifications ?? details.specifications ?? details.specification), amenities: Array.isArray(manual.amenities) ? manual.amenities.filter((v): v is string => typeof v === 'string') : [],
  };
}
export function validateProjectStep(form: ProjectForm, step: number): string | null {
  if (step === 0 && !form.company_name.trim()) return 'יש להזין שם חברה';
  if (step === 0 && form.phone && !/^(?:0\d{8,9}|972\d{8,9})$/.test(form.phone.replace(/[^\d]/g, ''))) return 'יש להזין מספר טלפון תקין';
  if (step === 1 && !form.name.trim()) return 'יש להזין שם פרויקט';
  const urls = step === 0 ? [form.company_source_url, form.logo_url] : step === 1 ? [form.source_url] : step === 5 ? form.images : [];
  if (urls.some(value => { if (!value.trim()) return false; try { return new URL(value).protocol !== 'https:'; } catch { return true; } })) return 'יש להזין קישור תקין שמתחיל ב־https://';
  if (step === 3 || step === 4) {
    const values = step === 3 ? [form.total_units, form.available_units, form.price_from] : form.units.flatMap(u => [u.rooms, u.size_sqm, u.price, u.count, u.balcony_sqm, u.parking]);
    if (values.some(v => v.trim() && (!Number.isFinite(projectNumber(v)) || Number(v.replace(/,/g, '')) < 0))) return 'יש להזין מספרים חיוביים או אפס';
    if (step === 3 && form.total_units && form.available_units && Number(form.available_units) > Number(form.total_units)) return 'מספר הדירות הזמינות גדול מסך הדירות';
  }
  return null;
}
export function projectPayload(form: ProjectForm, original?: DeveloperProject) {
  const details = asRecord(original?.source_details);
  return {
    commission_config: form.commission_config,
    name: form.name.trim(), city: form.city.trim() || null, neighborhood: form.neighborhood.trim() || null, address: form.address.trim() || null,
    status: form.status, total_units: projectNumber(form.total_units), available_units: projectNumber(form.available_units), price_from: projectNumber(form.price_from), delivery_date: form.delivery_date.trim() || null,
    description: form.description.trim() || null, source_url: form.source_url.trim() || null, images: [...new Set(form.images)], image_url: form.images[0] ?? null,
    apartments: form.units.map(u => ({ ...u, rooms: projectNumber(u.rooms), size_sqm: projectNumber(u.size_sqm), price: projectNumber(u.price), count: projectNumber(u.count), balcony_sqm: projectNumber(u.balcony_sqm), parking: projectNumber(u.parking) })),
    source_details: { ...details, deal_type: form.deal_type, manual: { ...asRecord(details.manual), specifications: form.specifications, amenities: form.amenities, project_overrides: { name: form.name.trim(), city: form.city.trim() || null, neighborhood: form.neighborhood.trim() || null, address: form.address.trim() || null, description: form.description.trim() || null, price_from: projectNumber(form.price_from), total_units: projectNumber(form.total_units), available_units: projectNumber(form.available_units), delivery_date: form.delivery_date.trim() || null } } },
  };
}