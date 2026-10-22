import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { PageCloseButton } from './page-close-button';

function Probe() {
  const location = useLocation();
  return <div data-testid="at">{location.pathname}</div>;
}

function renderAt(entries: string[], index: number) {
  render(
    <MemoryRouter initialEntries={entries} initialIndex={index}>
      <PageCloseButton />
      <Probe />
    </MemoryRouter>
  );
  return screen.getByTestId('at');
}

describe('legal page close button', () => {
  it('returns to the exact previous screen when one exists', () => {
    const at = renderAt(['/landing', '/terms'], 1);
    expect(at.textContent).toBe('/terms');
    fireEvent.click(screen.getByRole('button', { name: 'סגירה וחזרה לדף הקודם' }));
    expect(at.textContent).toBe('/landing');
  });

  it('falls back to the home page when the document was opened directly', () => {
    const at = renderAt(['/terms'], 0);
    expect(at.textContent).toBe('/terms');
    fireEvent.click(screen.getByRole('button', { name: 'סגירה וחזרה לדף הקודם' }));
    expect(at.textContent).toBe('/');
  });
});
