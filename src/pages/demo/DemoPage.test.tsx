import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import DemoPage from './DemoPage';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn().mockResolvedValue({ data: [], error: null }) } }));

afterEach(cleanup);

function renderDemo(initial = '/demo') {
  render(<MemoryRouter initialEntries={[initial]}><QueryClientProvider client={new QueryClient()}><Routes><Route path="/demo" element={<DemoPage />} /><Route path="/demo/:type" element={<DemoPage />} /></Routes></QueryClientProvider></MemoryRouter>);
}

it('shows all six role choices and navigates directly to the selected demo', async () => {
  renderDemo();
  expect(screen.getByRole('heading', { name: 'איזה חשבון תרצה לראות?' })).toBeTruthy();
  expect(screen.getAllByRole('link', { name: /^צפייה בדמו:/ })).toHaveLength(6);

  fireEvent.click(screen.getByRole('link', { name: 'צפייה בדמו: יזם / חברת בנייה' }));
  expect(await screen.findByRole('heading', { name: 'ניהול פרויקטים ודירות' })).toBeTruthy();
});

it('returns an invalid demo type to role selection instead of assuming broker', async () => {
  renderDemo('/demo/unknown');
  expect(await screen.findByRole('heading', { name: 'איזה חשבון תרצה לראות?' })).toBeTruthy();
});
