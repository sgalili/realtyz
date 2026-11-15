import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { SidebarRitaChat } from './SidebarRitaChat';

const identity = vi.hoisted(() => ({ scope: 'admin:shafi', ownerId: 'shafi', name: 'שפי ישראלי', firstName: 'שפי', gender: 'female', roles: ['affiliate'], ready: true, error: false }));
vi.mock('@/hooks/useRitaWorkspaceIdentity', () => ({ useRitaWorkspaceIdentity: () => identity }));
vi.mock('@/components/RitaAvatar', () => ({ RitaAvatar: () => <span /> }));
vi.mock('@/components/rita/RitaUserAvatar', () => ({ RitaUserAvatar: () => <span /> }));
beforeEach(() => {
  identity.scope = 'admin:shafi'; identity.firstName = 'שפי';
  HTMLElement.prototype.scrollTo = vi.fn();
});
function setup() {
  const cache = new QueryClient();
  return render(<QueryClientProvider client={cache}><SidebarRitaChat /></QueryClientProvider>);
}
function publish(scope: string, content: string) {
  act(() => { window.dispatchEvent(new CustomEvent('rita:state', { detail: { scope, messages: [{ role: 'assistant', content }], loading: false } })); });
}
it('drops transcript and unsent input on workspace change, rejecting late old events', () => {
  const view = setup();
  publish('admin:shafi', 'שיחה של שפי');
  fireEvent.change(screen.getByRole('textbox', { name: 'הודעה לריטה' }), { target: { value: 'טיוטה פרטית' } });
  identity.scope = 'admin:broker'; identity.firstName = 'אודי';
  view.rerender(<QueryClientProvider client={new QueryClient()}><SidebarRitaChat /></QueryClientProvider>);
  expect(screen.queryByText('שיחה של שפי')).toBeNull();
  expect(screen.getByRole('textbox', { name: 'הודעה לריטה' })).toHaveValue('');
  publish('admin:shafi', 'תשובה ישנה');
  expect(screen.queryByText('תשובה ישנה')).toBeNull();
  publish('admin:broker', 'תשובה חדשה');
  expect(screen.getByText('תשובה חדשה')).toBeInTheDocument();
});
it('tags send events with the exact account/workspace scope', () => {
  setup();
  const received = vi.fn();
  window.addEventListener('rita:send', received);
  fireEvent.change(screen.getByRole('textbox', { name: 'הודעה לריטה' }), { target: { value: 'היי' } });
  fireEvent.click(screen.getByRole('button', { name: 'שליחה' }));
  expect(received.mock.calls[0][0].detail).toEqual({ text: 'היי', scope: 'admin:shafi' });
  window.removeEventListener('rita:send', received);
});
it('uses Enter for a newline and Control + Enter to send', () => {
  setup();
  const received = vi.fn();
  window.addEventListener('rita:send', received);
  const input = screen.getByRole('textbox', { name: 'הודעה לריטה' });
  fireEvent.change(input, { target: { value: 'שורה ראשונה' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(received).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
  expect(received.mock.calls[0][0].detail).toEqual({ text: 'שורה ראשונה', scope: 'admin:shafi' });
  window.removeEventListener('rita:send', received);
});
it('shows clear only after history arrives and opens the full chat from the divider action', () => {
  setup();
  const opened = vi.fn();
  window.addEventListener('open-ai-drawer', opened);
  expect(screen.queryByRole('button', { name: 'איפוס צ׳אט' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'הגדלת שיחה עם ריטה' }));
  expect(opened.mock.calls[0][0].detail).toEqual({ expanded: true });
  publish('admin:shafi', 'יש היסטוריה');
  expect(screen.getByRole('button', { name: 'איפוס צ׳אט' })).toBeInTheDocument();
  window.removeEventListener('open-ai-drawer', opened);
});
it('asks before clearing and emits the scoped clear only after confirmation', () => {
  setup();
  publish('admin:shafi', 'היסטוריה לבדיקה');
  const cleared = vi.fn();
  window.addEventListener('rita:clear', cleared);
  const confirmation = vi.spyOn(window, 'confirm').mockReturnValue(false);
  fireEvent.click(screen.getByRole('button', { name: 'איפוס צ׳אט' }));
  expect(cleared).not.toHaveBeenCalled();
  confirmation.mockReturnValue(true);
  fireEvent.click(screen.getByRole('button', { name: 'איפוס צ׳אט' }));
  expect(cleared.mock.calls[0][0].detail).toEqual({ scope: 'admin:shafi' });
  confirmation.mockRestore();
  window.removeEventListener('rita:clear', cleared);
});
it('grows the conversation upward when the divider is dragged', () => {
  setup();
  const conversation = screen.getByTestId('rita-mini-conversation');
  vi.spyOn(conversation, 'getBoundingClientRect').mockReturnValue({ height: 160, top: 400 } as DOMRect);
  const handle = screen.getByRole('separator', { name: 'גרירה להגדלת שיחת ריטה' });
  fireEvent(handle, new MouseEvent('pointerdown', { bubbles: true, clientY: 400 }));
  fireEvent(window, new MouseEvent('pointermove', { clientY: 300 }));
  expect(conversation).toHaveStyle({ height: '260px' });
  fireEvent(window, new MouseEvent('pointerup'));
});