import { describe, expect, it } from 'vitest';
import { matchingDevelopers, normalizeDeveloperName } from '../../supabase/functions/_shared/developerIdentity';
import { parseDeveloperDirectory, developerDirectoryUrl, DEVELOPER_DIRECTORY_URL } from '../../supabase/functions/_shared/yad2DeveloperDirectory';

describe('developer identity', () => {
  it('reuses Karso despite Hebrew quotation marks, spacing and legal suffix', () => {
    expect(normalizeDeveloperName(' קרסו נדל״ן בע״מ ')).toBe(normalizeDeveloperName('קרסו נדלן'));
    expect(matchingDevelopers([{ company_name: 'קרסו נדלן', id: 'existing' }], 'קרסו נדל"ן')[0]?.id).toBe('existing');
  });
  it('does not merge companies merely sharing a word', () => {
    expect(matchingDevelopers([{ company_name: 'קרסו בנייה' }], 'קרסו נדלן')).toEqual([]);
  });
});
describe('automatic developer directory discovery', () => {
  it('extracts unique developer profiles and follows directory pagination only', () => {
    expect(parseDeveloperDirectory('<a href="/yad1/developers/1000015">קרסו</a><a href="/yad1/developers/1000015">x</a><a href="/yad1/developers?page=2">next</a>', DEVELOPER_DIRECTORY_URL)).toEqual({ urls: ['https://www.yad2.co.il/yad1/developers/1000015'], next_url: `${DEVELOPER_DIRECTORY_URL}?page=2` });
  });
  it('rejects unrelated and external directory pages', () => {
    expect(developerDirectoryUrl('https://evil.test/yad1/developers')).toBeNull();
    expect(developerDirectoryUrl('https://www.yad2.co.il/yad1/project/123')).toBeNull();
  });
});