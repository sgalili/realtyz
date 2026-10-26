import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { genderText, localizeCommand, personalizeMessage, profileGender, profileGenderByAddress, recipientProfileGender } from '../../supabase/functions/_shared/personalLanguage';
import { PersonalLanguageProvider, personalGenderKey, usePersonalLanguage } from './personalLanguage';
const mocks = vi.hoisted(() => ({ userId: 'personal-user', gender: 'female' as string | null, ids: [] as string[] }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: mocks.userId } }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({ select: () => ({ eq: (_key: string, id: string) => { mocks.ids.push(id); return { maybeSingle: async () => ({ data: { gender: mocks.gender } }) }; } }) }) } }));
afterEach(() => { cleanup(); mocks.userId = 'personal-user'; mocks.gender = 'female'; mocks.ids = []; });
describe('personal gender rules', () => {
  it('selects female, male and neutral forms without inferring from names', () => {
    const forms = { male: 'בחר', female: 'בחרי', neutral: 'בחירה' };
    expect(genderText('female', forms)).toBe('בחרי');
    expect(genderText('male', forms)).toBe('בחר');
    expect(genderText(profileGender('שרה'), forms)).toBe('בחירה');
  });
  it('personalizes only explicit system slots and leaves fixed WhatsApp copy alone', () => {
    expect(personalizeMessage('{{gender:פתח|פתחי|פתיחה}} את הפרטים', 'female')).toBe('פתחי את הפרטים');
    expect(personalizeMessage('התור שלך בתאריך {{1}}', 'female')).toBe('התור שלך בתאריך {{1}}');
  });
  it('handles authored commands without changing unrelated names or descriptions', () => {
    expect(localizeCommand('בחר עיר', 'female')).toBe('בחרי עיר');
    expect(localizeCommand('זכרון יעקב', 'female')).toBe('זכרון יעקב');
    expect(localizeCommand('מסנכרן נתונים', 'female')).toBe('מסנכרן נתונים');
  });
  it('loads language from the authenticated user rather than a workspace', async () => {
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={cache}><PersonalLanguageProvider>{children}</PersonalLanguageProvider></QueryClientProvider>;
    const { result } = renderHook(usePersonalLanguage, { wrapper });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(mocks.ids).toEqual(['personal-user']);
    expect(result.current.gender).toBe('female');
    act(() => cache.setQueryData(personalGenderKey('personal-user'), 'male'));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
    expect(result.current.gender).toBe('male');
  });
  it('queries exact recipient identity and neutralizes read failures', async () => {
    let queried = '';
    const reader = { from: () => ({ select: () => ({ eq: (_field: string, id: string) => { queried = id; return { maybeSingle: async () => ({ data: { gender: 'female' } }) }; } }) }) };
    expect(await recipientProfileGender(reader, 'recipient-user')).toBe('female');
    expect(queried).toBe('recipient-user');
    const broken = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: 'unavailable' }) }) }) }) };
    expect(await recipientProfileGender(broken, 'recipient-user')).toBeNull();
  });
  it('looks up normalized phone variants, not the sender gender', async () => {
    const reader = { from: () => ({ select: () => ({ eq: (_field: string, phone: string) => ({ maybeSingle: async () => ({ data: phone === '054-1234567' ? { gender: 'female' } : null }) }) }) }) };
    expect(await profileGenderByAddress(reader, 'phone', '+972541234567')).toBe('female');
  });
});