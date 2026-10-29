import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useWorkspace', () => ({ useActiveWorkspaceOwnerId: () => 'test-workspace' }));
vi.mock('@/hooks/useMetaPageBinding', () => ({ useMetaPageBinding: () => ({ data: null }) }));
vi.mock('@/i18n/personalLanguage', () => ({ usePersonalLanguage: () => ({ gender: 'male', command: (value: string) => value }), localizeControlNode: (node: unknown) => node }));
const mocks = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock('@/lib/openExternal', () => ({ openExternal: mocks.open }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: (table: string) => {
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'neq']) query[method] = () => query;
    query.order = () => Promise.resolve({ data: table === 'fb_user_groups' ? [
      { group_id: 'ext:123', group_name: 'קבוצה א', group_url: 'https://www.facebook.com/groups/123' },
      { group_id: 'ext:456', group_name: 'קבוצה ב', group_url: 'https://www.facebook.com/groups/456' },
    ] : [] });
    return query;
  },
} }));
import { CampaignGroupSelector } from './CampaignGroupSelector';
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('updates each row once, preserves preselection and toggles all repeatedly without mutation', async () => {
  const initial = Object.freeze(['123']);
  const updates = vi.fn();
  function Harness() {
    const [ids, setIds] = useState<string[]>([...initial]);
    return <CampaignGroupSelector selectedIds={ids} onChange={(next) => { updates(next); setIds(next); }} />;
  }
  render(<Harness />);
  const first = await screen.findByRole('checkbox', { name: 'קבוצה א' });
  expect(first).toHaveAttribute('aria-checked', 'true');
  fireEvent.click(first);
  expect(updates).toHaveBeenCalledTimes(1);
  expect(first).toHaveAttribute('aria-checked', 'false');
  fireEvent.click(screen.getByRole('checkbox', { name: 'קבוצה ב' }));
  expect(updates).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole('button', { name: 'בחירה מרובה' }));
  const all = screen.getByRole('checkbox', { name: 'בחר הכל' });
  for (let i = 0; i < 10; i++) {
    fireEvent.click(all);
    expect(all).toHaveAttribute('aria-checked', i % 2 === 0 ? 'true' : 'false');
  }
  expect(updates).toHaveBeenCalledTimes(12);
  expect(initial).toEqual(['123']);
  fireEvent.click(screen.getAllByTitle('פתח קבוצה בלשונית חדשה')[0]);
  expect(updates).toHaveBeenCalledTimes(12);
  expect(mocks.open).toHaveBeenCalledTimes(1);
});

it('accepts malformed selection input without crashing when toggled', async () => {
  const onChange = vi.fn();
  render(<CampaignGroupSelector selectedIds={null as unknown as string[]} onChange={onChange} />);
  const row = await screen.findByRole('checkbox', { name: 'קבוצה א' });
  fireEvent.click(row);
  await waitFor(() => expect(onChange).toHaveBeenCalledWith(['ext:123']));
});