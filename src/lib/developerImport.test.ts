import { describe, expect, it } from 'vitest';
import { developerImportUrl } from './developerImportUrl';
import { readPage, mergeProject } from '../../supabase/functions/yad2-developer-import/extract';
import { developerProjectImportRow, developerQueuePhaseAfterPage, detailedUnitCount, mergeDeveloperQueuePage, newDeveloperQueueWork } from '../../supabase/functions/_shared/yad2DeveloperImport';
import { allowsQueuedContactlessAccount, developerImportPlaceholderId, requiresLicenseVerification } from '../../supabase/functions/_shared/importedAccountPolicy';

describe('developer import', () => {
  it('keeps company bio separate from project and recommended company descriptions', () => {
    const payload = { developer: { name: 'Company', about: 'Company public biography' }, projects: [{ projectName: 'A', description: 'Project description' }], related: { developer: { about: 'Unrelated bio' } } };
    expect(readPage(`<script type="application/json">${JSON.stringify(payload)}</script>`, 'https://www.yad2.co.il/yad1/developers/company').developer.bio).toBe('Company public biography');
  });
  it('accepts main developer and direct project pages, never an individual listing or lookalike host', () => {
    expect(developerImportUrl('https://www.yad2.co.il/yad1/developers/acme')).toBeTruthy();
    expect(developerImportUrl('https://www.yad2.co.il/yad1/developers/1000318?city=2650&area=18')).toBe('https://www.yad2.co.il/yad1/developers/1000318');
    expect(developerImportUrl('https://www.yad2.co.il/yad1/project/16653?wat=tracking')).toBe('https://www.yad2.co.il/yad1/project/16653');
    expect(developerImportUrl('https://www.yad2.co.il/yad1/projects/16653')).toBe('https://www.yad2.co.il/yad1/projects/16653');
    for (const value of ['https://www.yad2.co.il/realestate/item/123', 'https://yad2.co.il.evil.test/yad1/developers/a', 'https://www.yad2.co.il/yad1/developers/a/project/1']) expect(developerImportUrl(value)).toBeNull();
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
  it('uses a stable source-specific identity when account creation is retried', async () => {
    const job = '7aa5c2c6-be79-4d2e-b36c-2ef2382558fc';
    const first = await developerImportPlaceholderId(job, 'https://www.yad2.co.il/yad1/developers/1000318');
    expect(first).toBe(await developerImportPlaceholderId(job, 'https://www.yad2.co.il/yad1/developers/1000318'));
    expect(first).not.toBe(await developerImportPlaceholderId(job, 'https://www.yad2.co.il/yad1/developers/1000319'));
    expect(first).toMatch(/^developer-7aa5c2c6-[0-9a-f]{20}$/);
  });
  it('exempts only imported developers from license and contact prerequisites', () => {
    expect(requiresLicenseVerification('developer')).toBe(false);
    expect(requiresLicenseVerification('broker')).toBe(true);
    expect(allowsQueuedContactlessAccount('developer', 'job-1')).toBe(true);
    expect(allowsQueuedContactlessAccount('developer')).toBe(false);
    expect(allowsQueuedContactlessAccount('property_owner', 'job-1')).toBe(false);
  });
  it('reads the real rendered developer profile fallback without requiring embedded project JSON', () => {
    const html = `<html><head><title>חברת אאורה ישראל | פרויקטים חדשים ודירות חדשות | יד2</title></head><body><ul><li data-testid="feed-project-card"><div><a href="https://www.yad2.co.il/yad1/project/16653?wat=tracking"><img class="mainImage" src="https://treedis-cdn.yad2.co.il/projects/1000415/assets/mainImage/a.webp"><p data-testid="feed-project-label">מגדלי הקצינים לוד</p><span data-testid="feed-project-subtitle">הרצל 1, מרכז העיר, לוד</span><span data-testid="feed-project-value">1,990,000&nbsp;₪</span></a></div></li></ul></body></html>`;
    const result = readPage(html, 'https://www.yad2.co.il/yad1/developers/1000010');
    expect(result.developer.company_name).toBe('אאורה ישראל');
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0]).toMatchObject({ name: 'מגדלי הקצינים לוד', city: 'לוד', address: 'הרצל 1, מרכז העיר, לוד', price_from: 1990000, source_project_id: '16653' });
    expect(result.links).toContain('https://www.yad2.co.il/yad1/project/16653');
  });
  it('reads direct project JSON-LD identity, address, images and provider', () => {
    const payload = { '@context': 'https://schema.org', '@type': 'RealEstateListing', url: 'https://www.yad2.co.il/yad1/project/9208', name: 'פרויקט הורדים - רמת יוסף, בת ים | מצלאוי חברה לבנין בע"מ', description: 'תיאור הפרויקט', image: ['https://media.example/project.webp'], mainEntity: { '@type': 'ApartmentComplex', name: 'פרויקט הורדים - רמת יוסף, בת ים | מצלאוי חברה לבנין בע"מ', numberOfAccommodationUnits: 128, address: { '@type': 'PostalAddress', streetAddress: 'הורדים 5', addressLocality: 'בת ים', addressRegion: 'מרכז' } }, provider: { '@type': 'Organization', name: 'מצלאוי חברה לבנין בע"מ' } };
    const result = readPage(`<script type="application/ld+json">${JSON.stringify(payload)}</script>`, 'https://www.yad2.co.il/yad1/project/9208');
    expect(result.developer.company_name).toBe('מצלאוי חברה לבנין בע"מ');
    expect(result.projects[0]).toMatchObject({ source_project_id: '9208', name: 'הורדים - רמת יוסף, בת ים', city: 'בת ים', address: 'הורדים 5', total_units: 128, images: ['https://media.example/project.webp'] });
  });
  it('imports exact source status and timeline while preserving internal marketing status', () => {
    const payload = { project: { projectId: 'p1', projectName: 'פרויקט', projectStatus: { text: 'בבנייה' }, timeline: [{ title: 'תכנון', displayDate: '2024', completed: true }, { title: 'אכלוס', displayDate: '2028', current: true }] } };
    const project = readPage(`<script type="application/json">${JSON.stringify(payload)}</script>`, 'https://www.yad2.co.il/yad1/project/p1').projects[0];
    expect(project.source_status).toBe('בבנייה');
    expect(project.timeline).toEqual([{ label: 'תכנון', date: '2024', completed: true }, { label: 'אכלוס', date: '2028', current: true }]);
    const row = developerProjectImportRow(undefined, project, 'dev-1', 'account-1');
    expect(row).toMatchObject({ status: 'marketing', source_status: 'בבנייה', is_public: false });
    expect(row.timeline).toHaveLength(2);
  });
  it('preserves exact rendered building milestones and completion flags', () => {
    const html = `<section data-testid="project-building-status"><div data-testid="building-status-step-initialPlanning" data-completed="true"><span>תכנון ראשוני</span></div><div data-testid="building-status-step-constructionCompleted" data-completed="false"><span>הבניה הסתיימה</span></div></section>`;
    const result = readPage(html, 'https://www.yad2.co.il/yad1/project/9208');
    expect(result.timeline).toEqual([{ label: 'תכנון ראשוני', completed: true }, { label: 'הבניה הסתיימה', completed: false }]);
  });
  it('continues to an own project page instead of failing before its company identity is read', () => {
    const work = newDeveloperQueueWork('https://www.yad2.co.il/yad1/developers/1000010', 1);
    mergeDeveloperQueuePage(work, { source_url: work.url, developer: {}, projects: [], links: ['https://www.yad2.co.il/yad1/project/16653'] });
    expect(developerQueuePhaseAfterPage(work)).toBe('developer_scanning');
    mergeDeveloperQueuePage(work, { source_url: 'https://www.yad2.co.il/yad1/project/16653', developer: { company_name: 'אאורה ישראל' }, projects: [{ source_project_id: '16653', name: 'מגדלי הקצינים לוד' }], links: [] });
    expect(developerQueuePhaseAfterPage(work)).toBe('developer_creating');
  });
});