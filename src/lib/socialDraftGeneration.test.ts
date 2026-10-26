import { beforeEach, expect, it, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import { generateSocialDraft, SOCIAL_DRAFT_CONFIRM_EVENT, SOCIAL_DRAFT_BATCH_SIZE, SOCIAL_DRAFT_CREDITS, needsDraftRenewal } from './socialDraftGeneration';
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }));
beforeEach(() => vi.mocked(supabase.functions.invoke).mockReset());
it('charges two credits per social draft batch', () => expect(SOCIAL_DRAFT_CREDITS).toBe(2));
it('includes three drafts before renewal', () => expect(SOCIAL_DRAFT_BATCH_SIZE).toBe(3));
it('requires renewal before the fourth and seventh requests, not the first three', () => {
  expect([0, 1, 2, 3, 4, 5, 6].map(needsDraftRenewal)).toEqual([false, false, false, true, false, false, true]);
});
it('approves renewal with the same request ID and returns the generated draft', async () => {
  const invoke = vi.mocked(supabase.functions.invoke);
  invoke.mockResolvedValueOnce({ data:null,error:{ context:new Response(JSON.stringify({confirmation_required:true,credits:2}),{status:409}) } } as any);
  invoke.mockResolvedValueOnce({ data:{content:'נוסח חדש'},error:null } as any);
  window.addEventListener(SOCIAL_DRAFT_CONFIRM_EVENT, ((event: CustomEvent) => event.detail.resolve(true)) as EventListener, {once:true});
  const result = await generateSocialDraft({platform:'facebook',topic:'דירה'});
  expect(result.data.content).toBe('נוסח חדש');
  expect(invoke.mock.calls[1][1]?.body).toMatchObject({confirmDraftCharge:true,generationRequestId:invoke.mock.calls[0][1]?.body.generationRequestId});
});
it('cancel does not execute or charge a renewed generation', async () => {
  vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({data:{confirmation_required:true},error:null} as any);
  window.addEventListener(SOCIAL_DRAFT_CONFIRM_EVENT, ((event: CustomEvent) => event.detail.resolve(false)) as EventListener,{once:true});
  await expect(generateSocialDraft({platform:'instagram'})).rejects.toMatchObject({name:'AbortError'});
  expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);
});
it('shows a meaningful failure after charge approval without retrying', async () => {
  const invoke=vi.mocked(supabase.functions.invoke);
  invoke.mockResolvedValueOnce({data:null,error:{context:{confirmation_required:true}}} as any);
  invoke.mockResolvedValueOnce({data:null,error:{context:new Response(JSON.stringify({error:'insufficient_credits'}),{status:402})}} as any);
  window.addEventListener(SOCIAL_DRAFT_CONFIRM_EVENT, ((event:CustomEvent)=>event.detail.resolve(true)) as EventListener,{once:true});
  await expect(generateSocialDraft({platform:'facebook'})).rejects.toThrow('אין מספיק קרדיטים');
  expect(invoke).toHaveBeenCalledTimes(2);
});