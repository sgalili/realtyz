import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { SidebarRitaChat } from './SidebarRitaChat';

const identity = vi.hoisted(() => ({ scope: 'admin:shafi', ownerId: 'shafi', name: 'שפי ישראלי', firstName: 'שפי', gender: 'female', roles: ['affiliate'], ready: true, error: false }));
vi.mock('@/hooks/useRitaWorkspaceIdentity', () => ({ useRitaWorkspaceIdentity: () => identity }));
vi.mock('@/components/RitaAvatar', () => ({ RitaAvatar: () => <span /> }));
beforeEach(() => { identity.scope = 'admin:shafi'; identity.firstName = 'שפי'; });
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