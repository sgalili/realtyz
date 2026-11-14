import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ChatFavoriteButton } from './ChatFavoriteButton';
const toggle = vi.hoisted(() => vi.fn().mockResolvedValue(true));
vi.mock('@/hooks/useInboxFavorites', () => ({ useInboxFavorites: () => ({ has: () => true, toggle }) }));
afterEach(() => { cleanup(); toggle.mockClear(); });
it('requires confirmation before removing a saved chat', async () => {
  render(<ChatFavoriteButton kind="lead" id="68c2e71f-2ed8-4659-b0de-e366880bc16a" />);
  fireEvent.click(screen.getByRole('button', { name: 'הסרה מהמועדפים' }));
  expect(toggle).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'ביטול' }));
  expect(toggle).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'הסרה מהמועדפים' }));
  fireEvent.click(screen.getByRole('button', { name: /^הסרה$/ }));
  await waitFor(() => expect(toggle).toHaveBeenCalledWith('lead', '68c2e71f-2ed8-4659-b0de-e366880bc16a'));
});