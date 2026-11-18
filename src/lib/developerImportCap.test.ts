import { describe, it, expect } from 'vitest';
import { mergeDeveloperQueuePage, newDeveloperQueueWork } from '../../supabase/functions/_shared/yad2DeveloperImport';
const base = 'https://www.yad2.co.il/yad1/developers/1';
const proj = (n: number) => ({ source_project_id: String(n), name: `P${n}`, source_url: `https://www.yad2.co.il/yad1/project/${n}` });
describe('developer import max projects', () => {
  it('keeps only the first two projects and their links', () => {
    const w = newDeveloperQueueWork(base, 1, 2);
    mergeDeveloperQueuePage(w, { source_url: base, developer: { company_name: 'X' }, projects: [proj(1), proj(2), proj(3)], links: [1, 2, 3].map(n => proj(n).source_url) });
    expect(w.projects.map(p => p.name)).toEqual(['P1', 'P2']);
    expect(w.pendingUrls).toEqual([proj(1).source_url, proj(2).source_url]);
  });
});
