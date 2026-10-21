import { describe, expect, it } from 'vitest';
import { projectForm, projectPayload, validateProjectStep, type DeveloperProject } from './developerProjectForm';

describe('developer project editor', () => {
  it('developer creation and saved project reopening use sale without a deal question', () => {
    expect(projectForm().deal_type).toBe('sale');
    const original = { source_details: { deal_type: 'rent', retained: 'source evidence' } } as unknown as DeveloperProject;
    const form = projectForm(original);
    expect(form.deal_type).toBe('sale');
    expect(projectPayload(form, original).source_details).toMatchObject({ deal_type: 'sale', retained: 'source evidence' });
  });
  it('requires company and project names at their own steps', () => {
    const form = projectForm();
    expect(validateProjectStep(form, 0)).toBeTruthy();
    form.company_name = 'חברת בדיקה';
    expect(validateProjectStep(form, 0)).toBeNull();
    expect(validateProjectStep(form, 1)).toBeTruthy();
    form.name = 'פרויקט בדיקה';
    expect(validateProjectStep(form, 1)).toBeNull();
  });
  it('rejects invalid availability, negative numbers and unsafe URLs', () => {
    const form = projectForm();
    form.total_units = '10'; form.available_units = '11';
    expect(validateProjectStep(form, 3)).toBeTruthy();
    form.available_units = '0'; form.price_from = '-1';
    expect(validateProjectStep(form, 3)).toBeTruthy();
    form.images = ['javascript:alert(1)'];
    expect(validateProjectStep(form, 5)).toBeTruthy();
  });
  it('preserves unit source evidence and original metadata across edits', () => {
    const original = { name: 'פרויקט', apartments: [{ source_unit_id: 'unit1', rooms: 3, source_details: { verified: true }, images: ['https://example.org/unit.jpg'] }], source_details: { source: 'original', manual: { retained: true } }, images: ['https://example.org/project.jpg'], total_units: 0 } as unknown as DeveloperProject;
    const form = projectForm(original);
    form.specifications = 'מפרט מעודכן';
    const payload = projectPayload(form, original);
    expect(payload.total_units).toBe(0);
    expect(payload.apartments[0]).toMatchObject({ source_details: { verified: true }, images: ['https://example.org/unit.jpg'] });
    expect(payload.source_details).toMatchObject({ source: 'original', manual: { retained: true, specifications: 'מפרט מעודכן' } });
    expect(payload.image_url).toBe('https://example.org/project.jpg');
  });
});