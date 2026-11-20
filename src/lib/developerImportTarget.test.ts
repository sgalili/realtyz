import { describe, expect, it } from 'vitest';
import { developerImportJobRow, developerImportTarget, developerSourceMatches } from '../../supabase/functions/_shared/developerImportTarget';

const workspace = '11111111-1111-4111-8111-111111111111';
const developer = '22222222-2222-4222-8222-222222222222';
const url = 'https://www.yad2.co.il/yad1/developers/1000318';

describe('developer import target', () => {
  it('retains the exact current developer in the durable job', () => {
    const target = developerImportTarget({ url, workspace_owner_id: workspace, developer_id: developer });
    expect(target).toMatchObject({ workspace, developerId: developer, sourceKind: 'profile' });
    expect(developerImportJobRow(target!, 'requester', 'lease')).toMatchObject({ workspace_owner_id: workspace, developer_id: developer, source_url: url });
  });

  it('rejects an invalid workspace without guessing a developer', () => {
    expect(developerImportTarget({ url, workspace_owner_id: 'other', developer_id: developer })).toBeNull();
  });

  it('rejects a source page belonging to a different developer', () => {
    expect(developerSourceMatches('קבוצת שבירו יזמות ובנייה', 'קבוצת שבירו יזמות ובנייה')).toBe(true);
    expect(developerSourceMatches('קבוצת שבירו יזמות ובנייה', 'יזם אחר בע״מ')).toBe(false);
  });
});
