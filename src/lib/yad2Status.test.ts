import { describe, expect, it } from 'vitest';
import { classifyYad2Status } from '../../supabase/functions/_shared/yad2Status';
const url = 'https://www.yad2.co.il/realestate/item/abc123';
describe('managed Yad2 liveness evidence', () => {
  it('requires actual listing evidence for a live response', () => {
    expect(classifyYad2Status(url, 200, 'דירה בהרצליה', '<h1>דירה בהרצליה</h1>')).toBe('live');
    expect(classifyYad2Status(url, 200, 'יד2', '<div>Loading</div>')).toBe('unknown');
  });
  it.each([401, 409, 429, 504])('never treats HTTP %s as a live listing', status => {
    expect(classifyYad2Status(url, status, 'דירה', '<h1>דירה</h1>')).toBe('unknown');
  });
  it('keeps CAPTCHA and empty responses unknown', () => {
    expect(classifyYad2Status(url, 200, 'Radware Bot Manager', '<h1>Verify you are human</h1>')).toBe('unknown');
    expect(classifyYad2Status(url, 200, '', '')).toBe('unknown');
  });
  it('recognizes explicit removal', () => {
    expect(classifyYad2Status(url, 404, '', '')).toBe('gone');
    expect(classifyYad2Status(url, 200, 'יד2', 'המודעה הוסרה')).toBe('gone');
  });
});