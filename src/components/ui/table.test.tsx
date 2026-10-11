import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from './table';
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'table-user' } }) }));
vi.mock('@/hooks/useWorkspace', () => ({ useWorkspace: () => ({ activeWorkspaceId: 'table-workspace' }) }));
vi.mock('./dropdown-menu', () => ({
  DropdownMenu: ({ children }: any) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: any) => children,
  DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
  DropdownMenuCheckboxItem: ({ children }: any) => <span>{children}</span>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({ children, onSelect }: any) => <button onClick={onSelect}>{children}</button>,
}));
afterEach(() => { cleanup(); localStorage.clear(); });
describe('shared column controls', () => {
  it('shows grips without hovering and resets only order to system defaults', () => {
    const key = `table-columns:v1:table-user:table-workspace:${window.location.pathname}:שם|מחיר|עיר`;
    localStorage.setItem(key, JSON.stringify({ order: [2, 1, 0], hidden: [1], sort: { index: 2, descending: true } }));
    render(<Table><TableHeader><TableRow><TableHead>שם</TableHead><TableHead>מחיר</TableHead><TableHead>עיר</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell>נכס</TableCell><TableCell>100</TableCell><TableCell>חיפה</TableCell></TableRow></TableBody></Table>);
    expect(screen.getAllByRole('columnheader')[0].textContent).toBe('עיר');
    expect(screen.getByRole('button', { name: 'הזזת עמודת שם' }).className).not.toContain('opacity-0');
    fireEvent.click(screen.getByRole('button', { name: 'איפוס סדר עמודות' }));
    expect(screen.getAllByRole('columnheader').map(el => el.textContent)).toEqual(['שם', 'עיר']);
    expect(JSON.parse(localStorage.getItem(key) || '{}')).toEqual({ order: [0, 1, 2], hidden: [1], sort: { index: 2, descending: true } });
  });
});