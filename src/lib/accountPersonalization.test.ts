import { expect, it } from 'vitest';
import { accountPersonalization } from '../../supabase/functions/_shared/accountPersonalization';
it('addresses the active female partner owner without borrowing an administrator identity', () => {
  const prompt = accountPersonalization({ full_name: 'שפי', gender: 'female' }, ['affiliate']);
  expect(prompt).toContain('"name":"שפי"');
  expect(prompt).toContain('feminine Hebrew');
  expect(prompt).toContain('"roles":["affiliate"]');
  expect(prompt).not.toContain('ויטמן');
});
it('unknown gender stays neutral rather than guessed from name', () => expect(accountPersonalization({ full_name: 'שפי' }, ['user'])).toContain('gender-neutral'));