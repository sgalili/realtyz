import { describe, expect, it } from 'vitest';
import { developerRetryDelay, mergeProjectPage, projectPageRows, safeImportError } from '../../supabase/functions/developer-import-jobs/queue';

describe('background developer page queue', () => {
  it('creates one durable row per discovered project and preserves no-link projects without another fetch', () => {
    const source = 'https://www.yad2.co.il/yad1/developers/acme';
    const linked = { source_project_id: 'p1', name: 'פרויקט א', source_url: 'https://www.yad2.co.il/yad1/project/p1?utm_source=x' };
    const unlinked = { source_project_id: 'p2', name: 'פרויקט ב', source_url: null };
    const rows = projectPageRows(source, [linked, unlinked], [linked.source_url]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ url: 'https://www.yad2.co.il/yad1/project/p1', fetch_required: true, payload: { projects: [linked] } });
    expect(rows[1]).toMatchObject({ kind: 'project', fetch_required: false, payload: { projects: [unlinked] } });
  });

  it('merges a project detail page into the saved seed without dropping units', () => {
    const seed = [{ source_project_id: 'p1', name: 'פרויקט', images: ['a'], apartments: [], source_details: { seed: true } }];
    const detail = [{ source_project_id: 'p1', name: 'פרויקט', images: ['b'], apartments: [{ source_unit_id: 'u1' }], source_details: { detail: true } }];
    const merged = mergeProjectPage(seed, detail);
    expect(merged).toHaveLength(1);
    expect(merged[0].images).toEqual(['a', 'b']);
    expect(merged[0].apartments).toHaveLength(1);
  });

  it('backs off individual failures and respects longer provider 429 delays', () => {
    expect(developerRetryDelay(1)).toBe(15_000);
    expect(developerRetryDelay(2)).toBe(30_000);
    expect(developerRetryDelay(1, 450_000, true)).toBe(450_000);
    expect(developerRetryDelay(1, 0, true)).toBe(300_000);
  });

  it('redacts credentials and URLs from persisted page errors', () => {
    const error = safeImportError(new Error('Bearer secret https://private.example/path'));
    expect(error).not.toContain('secret');
    expect(error).not.toContain('private.example');
  });
});
