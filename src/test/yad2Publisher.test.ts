import { describe, expect, it } from 'vitest';
import { extractYad2Publisher, verifiedSourceLicense, publisherImageUrl } from '../../supabase/functions/_shared/yad2Publisher';
import { matchesAdvertiser } from '../../supabase/functions/_shared/listingMediaVision';

const source = 'https://www.yad2.co.il/realestate/item/abc123';
describe('original Yad2 publisher evidence', () => {
  it('retains explicit publisher logo and licensed advertiser, never related advertisers', () => {
    const metadata = extractYad2Publisher({ customer: { name: 'עדן ויטמן', licenseNumber: '3251745', logo: 'https://img.yad2.co.il/office-logo.png' }, related: [{ agency: { name: 'Wrong office' } }] }, source);
    expect(metadata.broker_name).toBe('עדן ויטמן');
    expect(metadata.office_logo_url).toBe('https://img.yad2.co.il/office-logo.png');
    expect(metadata.office_name).toBeUndefined();
    expect(verifiedSourceLicense(metadata)).toBe('3251745');
  });
  it('hides unsupported, placeholder and conflicting license values', () => {
    expect(verifiedSourceLicense({ broker_license: '3251745' })).toBeNull();
    expect(verifiedSourceLicense({ broker_license_number: '3251745', broker_license_evidence: { source: 'source_ad', source_url: source, number: '123' } })).toBeNull();
    expect(extractYad2Publisher({ broker: { licenseNumber: 'לא צוין' } }, source).broker_license_number).toBeUndefined();
  });
  it('classifies exclusivity as broker without inventing license', () => {
    const metadata = extractYad2Publisher({ additionalDetails: { isAssetExclusive: true } }, source);
    expect(metadata.publisher_kind).toBe('broker');
    expect(metadata.broker_license_number).toBeUndefined();
  });
  it('rejects platform branding and only accepts matching gallery branding', () => {
    expect(publisherImageUrl('https://www.yad2.co.il/yad2-logo.svg')).toBeNull();
    expect(publisherImageUrl('https://unrelated.example/logo.png')).toBeNull();
    expect(matchesAdvertiser('אנגלו סכסון', ['אנגלו סכסון הרצליה'])).toBe(true);
    expect(matchesAdvertiser('Other agency', ['אנגלו סכסון'])).toBe(false);
  });
});