import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickPublicPromotion } from './QuickPublicPromotion';
import { TooltipProvider } from '@/components/ui/tooltip';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  publish: vi.fn(),
  pause: vi.fn(),
  roles: ['agent'] as string[],
}));
vi.mock('@/hooks/useWorkspace', () => ({ useWorkspace: () => ({ activeWorkspaceId: 'workspace-1', activeWorkspace: { role: 'user', workspace_name: 'משרד' } }) }));
vi.mock('@/hooks/useUserRole', () => ({ useUserRole: () => ({ roles: mocks.roles, loading: false }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from } }));
vi.mock('@/lib/publishInventory', () => ({ publishInventory: mocks.publish, pauseInventory: mocks.pause, publicationErrorMessage: () => 'הפרסום נכשל' }));
vi.mock('./AccountLeadBudget', () => ({ AccountLeadBudget: () => null }));

describe('broker approval publication access', () => {
  beforeEach(() => vi.clearAllMocks());
  it('saves edited questions independently under the authorized listing scope', async () => {
    const property = { id: 'property-1', address: 'הרצל 10', city: 'חיפה', asking_price: 1000000, status: 'pending', is_published: false, affiliate_enabled: false, affiliate_tier4_amount: 1, affiliate_tier4_type: 'percent', contact_options: { questions: ['תקציב?', 'משכנתה?', 'מועד מעבר?'], questions_phone: ['מתי להתקשר?'] } };
    const query = { select: vi.fn(), eq: vi.fn(), in: vi.fn().mockResolvedValue({ data: [property], error: null }), update: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'property-1' }, error: null }) };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.update.mockReturnValue(query); mocks.from.mockReturnValue(query);
    mocks.publish.mockResolvedValue(['property-1']);
    render(<QueryClientProvider client={new QueryClient()}><TooltipProvider><QuickPublicPromotion ids={['property-1']} onPublished={vi.fn()} /></TooltipProvider></QueryClientProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'פרסום בלוח הציבורי' }));
    fireEvent.click(await screen.findByRole('button', { name: 'שאלות סינון בוואטסאפ (3)' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'שאלה 1' }), { target: { value: 'יש נכס למכור?' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'אישור התקנון והעמלות' }));
    fireEvent.click(screen.getByRole('button', { name: 'שמירת תמחור ופרסום' }));
    await waitFor(() => expect(query.update).toHaveBeenCalledWith(expect.objectContaining({ contact_options: expect.objectContaining({ questions: ['יש נכס למכור?', 'משכנתה?', 'מועד מעבר?'], questions_phone: ['מתי להתקשר?'] }) })));
    expect(query.eq).toHaveBeenCalledWith('workspace_owner_id', 'workspace-1');
    expect(query.eq).toHaveBeenCalledWith('id', 'property-1');
  });
  it('completes saved pause without waiting for unrelated feed refreshes', async () => {
    const property = { id: 'property-1', address: 'הרצל 10', city: 'חיפה', asking_price: 1000000, status: 'live', is_published: true, affiliate_enabled: true, affiliate_tier4_amount: 1, affiliate_tier4_type: 'percent' };
    const query = { select: vi.fn(), eq: vi.fn(), in: vi.fn().mockResolvedValue({ data: [property], error: null }) };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query); mocks.from.mockReturnValue(query);
    mocks.pause.mockResolvedValue(['property-1']);
    const client = new QueryClient();
    vi.spyOn(client, 'invalidateQueries').mockImplementation(() => new Promise(() => {}));
    const onPublished = vi.fn();
    render(<QueryClientProvider client={client}><TooltipProvider><QuickPublicPromotion ids={['property-1']} onPublished={onPublished} /></TooltipProvider></QueryClientProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'פרסום בלוח הציבורי' }));
    fireEvent.click(await screen.findByRole('button', { name: 'השעיית פרסום' }));
    expect(mocks.pause).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'אישור הפסקת הפצה' }));
    await waitFor(() => expect(onPublished).toHaveBeenCalledWith(['property-1'], false));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('allows an approved broker to publish even when the membership still says user', async () => {
    const property = { id: 'property-1', address: 'הרצל 10', city: 'חיפה', asking_price: 1000000, status: 'pending', is_published: false, affiliate_enabled: false, affiliate_tier4_amount: 1, affiliate_tier4_type: 'percent' };
    const query = { select: vi.fn(), eq: vi.fn(), update: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'property-1' }, error: null }), in: vi.fn().mockResolvedValue({ data: [property], error: null }) };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.update.mockReturnValue(query);
    mocks.from.mockReturnValue(query);
    mocks.publish.mockResolvedValue(['property-1']);
    const onPublished = vi.fn();
    render(<QueryClientProvider client={new QueryClient()}><TooltipProvider><QuickPublicPromotion ids={['property-1']} onPublished={onPublished} /></TooltipProvider></QueryClientProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'פרסום בלוח הציבורי' }));
    fireEvent.click(await screen.findByRole('checkbox'));
    expect(mocks.publish).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'שמירת תמחור ופרסום' }));
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledWith(expect.anything(), 'workspace-1', ['property-1']));
    expect(query.update).toHaveBeenCalledWith(expect.objectContaining({ affiliate_tier4_amount: 1, affiliate_tier4_type: 'percent' }));
    expect(query.update.mock.invocationCallOrder[0]).toBeLessThan(mocks.publish.mock.invocationCallOrder[0]);
    await waitFor(() => expect(onPublished).toHaveBeenCalledWith(['property-1']));
  });
  it('never publishes when confirmed pricing fails to save', async () => {
    const property = { id: 'property-1', address: 'הרצל 10', city: 'חיפה', asking_price: 1000000, status: 'pending', is_published: false, affiliate_enabled: false, affiliate_tier4_amount: 1, affiliate_tier4_type: 'percent' };
    const query = { select: vi.fn(), eq: vi.fn(), update: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'save failed' } }), in: vi.fn().mockResolvedValue({ data: [property], error: null }) };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.update.mockReturnValue(query); mocks.from.mockReturnValue(query);
    render(<QueryClientProvider client={new QueryClient()}><TooltipProvider><QuickPublicPromotion ids={['property-1']} onPublished={vi.fn()} /></TooltipProvider></QueryClientProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'פרסום בלוח הציבורי' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'אישור התקנון והעמלות' }));
    fireEvent.click(screen.getByRole('button', { name: 'שמירת תמחור ופרסום' }));
    await waitFor(() => expect(query.maybeSingle).toHaveBeenCalled());
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it('canceling the pause warning leaves distribution unchanged', async () => {
    const property = { id: 'property-1', address: 'הרצל 10', city: 'חיפה', asking_price: 1000000, status: 'live', is_published: true, affiliate_enabled: true, affiliate_tier4_amount: 1, affiliate_tier4_type: 'percent' };
    const query = { select: vi.fn(), eq: vi.fn(), in: vi.fn().mockResolvedValue({ data: [property], error: null }) };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query); mocks.from.mockReturnValue(query);
    render(<QueryClientProvider client={new QueryClient()}><TooltipProvider><QuickPublicPromotion ids={['property-1']} onPublished={vi.fn()} /></TooltipProvider></QueryClientProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'פרסום בלוח הציבורי' }));
    fireEvent.click(await screen.findByRole('button', { name: 'השעיית פרסום' }));
    const { within } = await import('@testing-library/react');
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'ביטול' }));
    expect(mocks.pause).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});