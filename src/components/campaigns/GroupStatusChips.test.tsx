import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock('@/lib/openExternal', () => ({ openExternal: mocks.open }));
vi.mock('@/hooks/useFbGroupMeta', () => ({
  useFbGroupMeta: () => ({}), localQueueGroupNames: () => ({}), groupKeyFrom: (g: string) => g.replace(/^ext:/, ''),
}));
import { GroupStatusChips } from './GroupStatusChips';
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('shows both real names without count pills or animated loaders', () => {
  render(<GroupStatusChips groupIds={['ext:123', '123', '456']} meta={{
    '123': { name: 'דירות בתל אביב', icon: null }, '456': { name: 'נדלן ברמת גן', icon: null },
  }} results={{ '123': { state: 'published' }, '456': { state: 'pending' } }} />);
  expect(screen.getAllByText('דירות בתל אביב')).toHaveLength(1);
  expect(screen.getByText('נדלן ברמת גן')).toBeInTheDocument();
  expect(screen.queryByText('2 קבוצות')).not.toBeInTheDocument();
  expect(screen.getByLabelText('פורסם')).toBeInTheDocument();
  expect(screen.getByLabelText('ממתין לאישור')).toBeInTheDocument();
  expect(document.querySelector('.animate-spin')).toBeNull();
  expect(screen.getByRole('button', { name: /דירות בתל אביב/ })).toHaveClass('border-0');
});
it('keeps group names visible while opening series details in an overlay', () => {
  render(<GroupStatusChips groupIds={['123', '456']} meta={{
    '123': { name: 'קבוצה א', icon: null }, '456': { name: 'קבוצה ב', icon: null },
  }}>series details</GroupStatusChips>);
  expect(screen.getByText('קבוצה א')).toBeVisible();
  expect(screen.queryByText('series details')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'פרטי קבוצות ופוסטים' }));
  expect(screen.getByText('series details')).toBeVisible();
});
it('opens a single group directly without a dropdown, even when series children exist', () => {
  render(<GroupStatusChips groupIds={['ext:123']} meta={{ '123': { name: 'קבוצה יחידה', icon: null, url: 'https://www.facebook.com/groups/123' } }}>child</GroupStatusChips>);
  const pill = screen.getByRole('button', { name: /קבוצה יחידה/ });
  expect(pill).not.toHaveAttribute('aria-expanded');
  fireEvent.click(pill);
  expect(mocks.open).toHaveBeenCalledWith('https://www.facebook.com/groups/123');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByText('child')).not.toBeInTheDocument();
});
it('collapses multiple campaign targets into a counter and reveals names only in the overlay', () => {
  render(<GroupStatusChips collapsedCounter groupIds={['123', 'ext:123', '456']} meta={{
    '123': { name: 'קבוצה א', icon: null }, '456': { name: 'קבוצה ב', icon: null },
  }}>series details</GroupStatusChips>);
  expect(screen.queryByText('קבוצה א')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '2 קבוצות' }));
  expect(screen.getByText('קבוצה א')).toBeVisible();
  expect(screen.getByText('series details')).toBeVisible();
});
it('puts the static status icon before the single campaign group name', () => {
  render(<GroupStatusChips collapsedCounter groupIds={['123']} meta={{ '123': { name: 'קבוצה יחידה', icon: null } }} />);
  const target = screen.getByRole('button', { name: /קבוצה יחידה/ });
  expect(target.firstElementChild).toHaveAttribute('aria-label', 'ממתין לאישור');
  expect(target.lastElementChild).toHaveTextContent('קבוצה יחידה');
  expect(screen.queryByText('1 קבוצות')).not.toBeInTheDocument();
});