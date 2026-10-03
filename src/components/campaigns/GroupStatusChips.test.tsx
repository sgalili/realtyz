import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock('@/lib/openExternal', () => ({ openExternal: mocks.open }));
vi.mock('@/hooks/useFbGroupMeta', () => ({
  useFbGroupMeta: () => ({}), localQueueGroupNames: () => ({}), groupKeyFrom: (g: string) => g.replace(/^ext:/, ''),
}));
import { GroupStatusChips } from './GroupStatusChips';
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('opens a single group directly without a dropdown, even when series children exist', () => {
  render(<GroupStatusChips groupIds={['ext:123']} meta={{ '123': { name: 'קבוצה יחידה', icon: null, url: 'https://www.facebook.com/groups/123' } }}>child</GroupStatusChips>);
  const pill = screen.getByRole('button', { name: 'קבוצה יחידה' });
  expect(pill).not.toHaveAttribute('aria-expanded');
  fireEvent.click(pill);
  expect(mocks.open).toHaveBeenCalledWith('https://www.facebook.com/groups/123');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByText('child')).not.toBeInTheDocument();
});