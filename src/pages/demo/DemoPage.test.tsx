import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import DemoPage from './DemoPage';

const startDemoSession = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/demoView', () => ({ DEMO_HOME: { developer: '/developer-dashboard' }, startDemoSession: (t: string) => startDemoSession(t) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock('@/components/demo/DemoViewBar', () => ({ useDemoViewType: () => null }));

afterEach(cleanup);

function renderDemo(initial = '/demo') {
  render(<MemoryRouter initialEntries={[initial]}><QueryClientProvider client={new QueryClient()}><Routes><Route path="/demo" element={<DemoPage />} /><Route path="/demo/:type" element={<DemoPage />} /><Route path="/developer-dashboard" element={<h1>real developer screen</h1>} /></Routes></QueryClientProvider></MemoryRouter>);
}

it('shows all six role choices', () => {
  renderDemo();
  expect(screen.getByRole('heading', { name: 'איזה חשבון תרצה לראות?' })).toBeTruthy();
  expect(screen.getAllByRole('link', { name: /^צפייה בדמו:/ })).toHaveLength(6);
});

it('opens the real screen of the chosen role in view-only demo, without a code', async () => {
  renderDemo('/demo/developer');
  expect(await screen.findByRole('heading', { name: 'real developer screen' })).toBeTruthy();
  expect(startDemoSession).toHaveBeenCalledWith('developer');
});

it('returns an invalid demo type to role selection instead of assuming broker', async () => {
  renderDemo('/demo/unknown');
  expect(await screen.findByRole('heading', { name: 'איזה חשבון תרצה לראות?' })).toBeTruthy();
});
