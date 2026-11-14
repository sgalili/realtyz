import { describe, expect, it } from 'vitest';
import { developerImportUrl } from './developerImportUrl';
import { readPage, mergeProject } from '../../supabase/functions/yad2-developer-import/extract';
import { developerProjectImportRow, detailedUnitCount, mergeDeveloperQueuePage, newDeveloperQueueWork } from '../../supabase/functions/_shared/yad2DeveloperImport';
import { allowsQueuedContactlessAccount, requiresLicenseVerification } from '../../supabase/functions/_shared/importedAccountPolicy';

describe('developer import', () => {
  it('keeps company bio separate from project and recommended company descriptions', () => {
    const payload = { developer: { name: 'Company', about: 'Company public biography' }, projects: [{ projectName: 'A', description: 'Project description' }], related: { developer: { about: 'Unrelated bio' } } };
    expect(readPage(`<script type="application/json">${JSON.stringify(payload)}</script>`, 'https://www.yad2.co.il/yad1/developers/company').developer.bio).toBe('Company public biography');
  });
  it('accepts only the main developer page, never an individual listing or project', () => {
    expect(developerImportUrl('https://www.yad2.co.il/yad1/developers/acme')).toBeTruthy();
    expect(developerImportUrl('https://www.yad2.co.il/yad1/developers/1000318?city=2650&area=18')).toBe('https://www.yad2.co.il/yad1/developers/1000318');
    for (const value of ['https://www.yad2.co.il/realestate/item/123', 'https://www.yad2.co.il/yad1/project/123', 'https://yad2.co.il.evil.test/yad1/developers/a', 'https://www.yad2.co.il/yad1/developers/a/project/1']) expect(developerImportUrl(value)).toBeNull();
  });
  it('keeps projects separate, including all source unit details, images and floor zero', () => {
    const data = { developer: { name: 'Company' }, projects: [
      { id: 'a', name: 'A', city: { text: 'אשדוד' }, url: '/yad1/project/a', images: [{ url: 'https://media.example/a' }], apartments: [{ id: 'u', rooms: 4, floor: 0, price: 2000000, images: ['https://media.example/unit'], balconyArea: 12 }] },
      { id: 'b', name: 'B', units: [{ rooms: 3, size: 80, price: 1800000 }] },
    ], related: [{ projectName: 'Unrelated project', projectId: 'unrelated', city: 'Other', apartments: [{ rooms: 2, price: 1 }] }] };
    const result = readPage(`<script type="application/json">${JSON.stringify(data)}</script>`, 'https://www.yad2.co.il/yad1/developers/company');
    expect(result.projects).toHaveLength(2);
    expect(result.projects[0].city).toBe('אשדוד');
    expect(result.projects[0].apartments[0].floor).toBe('0');
    expect(result.projects[0].apartments[0].source_details.balconyArea).toBe(12);
    expect(result.projects[0].images).toContain('https://media.example/a');
    expect(result.projects[1].apartments).toHaveLength(1);
    expect(result.links).toContain('https://www.yad2.co.il/yad1/project/a');
  });
  it('merges richer linked detail without losing summary or duplicating units', () => {
    const summary = { name: 'A', total_units: 50, images: ['a'], apartments: [{ source_unit_id: 'u', rooms: 3 }], source_details: { summary: true } };
    const detail = { name: 'A', total_units: null, images: ['a', 'b'], apartments: [{ source_unit_id: 'u', rooms: 3, floor: '2' }], source_details: { details: true } };
    const merged = mergeProject(summary, detail);
    expect(merged.total_units).toBe(50);
    expect(merged.images).toEqual(['a', 'b']);
    expect(merged.apartments).toHaveLength(1);
    expect(merged.source_details).toEqual({ summary: true, details: true });
  });
  it('reads Yad2 wrapper and metaData project fields together', () => {
    const payload = { props: { pageProps: { projects: [{ token: '12920', projectYzerId: 12920, projectId: 1019449, address: { city: { text: 'רמת השרון' }, display: 'אוסישקין 9, רמת השרון' }, additionalDetails: { minPrice: 2500000 }, metaData: { projectName: 'רובע הדר', info: 'תיאור הפרויקט', apartments: 82, images: ['https://media.example/project'], companyDetails: [{ name: 'מצלאוי', logo: 'https://media.example/logo', info: 'תיאור החברה' }] } }] } } };
    const result = readPage(`<script type="application/json">${JSON.stringify(payload)}</script>`, 'https://www.yad2.co.il/yad1/developers/1000318');
    expect(result.developer).toMatchObject({ company_name: 'מצלאוי', logo_url: 'https://media.example/logo', bio: 'תיאור החברה' });
    expect(result.projects[0]).toMatchObject({ source_project_id: '12920', name: 'רובע הדר', city: 'רמת השרון', address: 'אוסישקין 9, רמת השרון', total_units: 82, price_from: 2500000, source_url: 'https://www.yad2.co.il/yad1/project/12920' });
  });
  it('resumes every own project page without treating expected projects as a cap', () => {
    const work = newDeveloperQueueWork('https://www.yad2.co.il/yad1/developers/1000318', 1);
    mergeDeveloperQueuePage(work, { source_url: work.url, developer: { company_name: 'יזמות בע״מ', logo_url: 'https://media.example/logo.png' }, projects: [
      { source_project_id: 'a', name: 'A', source_url: 'https://www.yad2.co.il/yad1/project/a', images: [], apartments: [] },
      { source_project_id: 'b', name: 'B', source_url: 'https://www.yad2.co.il/yad1/project/b', images: [], apartments: [] },
    ], links: ['https://www.yad2.co.il/yad1/project/a', 'https://www.yad2.co.il/yad1/project/b'] });
    expect(work.projects).toHaveLength(2);
    expect(work.pendingUrls).toHaveLength(2);
    mergeDeveloperQueuePage(work, { source_url: 'https://www.yad2.co.il/yad1/project/a', developer: {}, projects: [{ source_project_id: 'a', name: 'A', source_url: 'https://www.yad2.co.il/yad1/project/a', images: [], apartments: [{ source_unit_id: 'u1', rooms: 4 }] }], links: [] });
    expect(work.projects).toHaveLength(2);
    expect(work.projects[0].apartments).toHaveLength(1);
    expect(work.pendingUrls).toEqual(['https://www.yad2.co.il/yad1/project/b']);
  });
  it('saves imported projects privately with all units and preserves manual publication and commissions', () => {
    const old = { id: 'old', status: 'marketing', is_public: true, commission_config: { lead: 5 }, source_details: { manual: { project_overrides: { name: 'שם ידני' } } }, apartments: [] };
    const project = { source_project_id: 'p1', name: 'מקור', images: ['https://media.example/p.jpg'], apartments: [{ source_unit_id: 'u1', rooms: 4 }], source_details: { hierarchy: {} } };
    const row = developerProjectImportRow(old, project, 'dev-1', 'account-1');
    expect(row).toMatchObject({ developer_id: 'dev-1', workspace_owner_id: 'account-1', name: 'שם ידני', is_public: true, commission_config: { lead: 5 } });
    expect(row.apartments).toHaveLength(1);
    expect(detailedUnitCount(row)).toBe(1);
    expect(developerProjectImportRow(undefined, project, 'dev-1', 'account-1').is_public).toBe(false);
  });
  it('exempts only imported developers from license and contact prerequisites', () => {
    expect(requiresLicenseVerification('developer')).toBe(false);
    expect(requiresLicenseVerification('broker')).toBe(true);
    expect(allowsQueuedContactlessAccount('developer', 'job-1')).toBe(true);
    expect(allowsQueuedContactlessAccount('developer')).toBe(false);
    expect(allowsQueuedContactlessAccount('property_owner', 'job-1')).toBe(false);
  });
});