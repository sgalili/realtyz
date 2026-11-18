import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

import { DemoRoleSwitcher } from './DemoRoleSwitcher';

afterEach(() => {
  cleanup();
  navigate.mockReset();
});

function setup() {
  render(
    <MemoryRouter>
      <DemoRoleSwitcher />
    </MemoryRouter>,
  );
}

it('offers every demo role as an immediate entry button', () => {
  setup();
  for (const label of ['מתווך / שותף', 'חברת שיווק נדל"ן', 'יזם / חברת בנייה', 'מוכר / משכיר פרטי', 'קונה / סוחר נכסים', 'שותף בלבד']) {
    expect(screen.getByRole('button', { name: `כניסה לדמו: ${label}` })).toBeTruthy();
  }
});

it('jumps straight to the matching demo route when a role is chosen', () => {
  setup();
  fireEvent.click(screen.getByRole('button', { name: 'כניסה לדמו: יזם / חברת בנייה' }));
  expect(navigate).toHaveBeenCalledWith('/demo/developer');
  fireEvent.click(screen.getByRole('button', { name: 'כניסה לדמו: מוכר / משכיר פרטי' }));
  expect(navigate).toHaveBeenCalledWith('/demo/owner');
});

it('opens the public demo in a new tab on the canonical domain, never a Lovable host', () => {
  setup();
  const link = screen.getByRole('link', { name: 'פתח בכרטיסייה חדשה: קונה / סוחר נכסים' });
  expect(link.getAttribute('href')).toBe('https://toraff.co.il/demo/buyer');
  expect(link.getAttribute('target')).toBe('_blank');
  expect(screen.getAllByRole('link').every((anchor) => !/lovable\./.test(anchor.getAttribute('href') ?? ''))).toBe(true);
});

it('states that the demo is view-only mock data', () => {
  setup();
  expect(screen.getByText(/ללא אפשרות עריכה, מחיקה או פרסום/)).toBeTruthy();
});
