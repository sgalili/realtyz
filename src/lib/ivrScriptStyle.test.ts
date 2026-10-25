import { expect, it } from 'vitest';
import { ivrScriptStyle, shouldLearnIvrScript } from '../../supabase/functions/_shared/ivrScriptStyle';
it('learns only nonempty final scripts after successful calls', () => {
  expect(shouldLearnIvrScript(0, 'שלום.')).toBe(false);
  expect(shouldLearnIvrScript(1, '')).toBe(false);
  expect(shouldLearnIvrScript(1, 'שלום.')).toBe(true);
});
it('learns style without promoting old property facts to future scripts', () => {
  const style = ivrScriptStyle('שלום, דירה ברחוב הפרחים במחיר 2000000. מוזמנים לתאם ביקור.');
  expect(style).toContain('2 משפטים');
  expect(style).toContain('פתיחה בברכה');
  expect(style).not.toContain('2000000');
  expect(style).not.toContain('הפרחים');
});