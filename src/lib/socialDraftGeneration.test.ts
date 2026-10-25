import { expect, it, vi } from 'vitest';
import { SOCIAL_DRAFT_BATCH_SIZE, SOCIAL_DRAFT_CREDITS, needsDraftRenewal } from './socialDraftGeneration';
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }));
it('charges two credits per social draft batch', () => expect(SOCIAL_DRAFT_CREDITS).toBe(2));
it('includes three drafts before renewal', () => expect(SOCIAL_DRAFT_BATCH_SIZE).toBe(3));
it('requires renewal before the fourth and seventh requests, not the first three', () => {
  expect([0, 1, 2, 3, 4, 5, 6].map(needsDraftRenewal)).toEqual([false, false, false, true, false, false, true]);
});