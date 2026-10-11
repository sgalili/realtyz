import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SelectAllRow, SelectModeToggle } from './multi-select-controls';

afterEach(cleanup);
describe('empty-safe selection controls', () => {
  it('hides the toggle and header for zero rows', () => {
    render(<><SelectModeToggle total={0} active={false} onToggle={vi.fn()} onSelectAll={vi.fn()} /><SelectAllRow total={0} selected={0} onToggle={vi.fn()} /></>);
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('toggles selection mode directly without a menu', () => {
    const toggle = vi.fn(), all = vi.fn();
    render(<SelectModeToggle total={2} active={false} onToggle={toggle} onSelectAll={all} />);
    fireEvent.click(screen.getByRole('button', { name: 'בחירה מרובה' }));
    expect(toggle).toHaveBeenCalledOnce();
    expect(all).not.toHaveBeenCalled();
    expect(screen.queryByText('בחר הכל')).toBeNull();
  });
  it('shows בחר הכל and the selected counter next to the toggle when active', () => {
    const toggle = vi.fn(), all = vi.fn();
    render(<SelectModeToggle total={5} active count={3} onToggle={toggle} onSelectAll={all} />);
    fireEvent.click(screen.getByText('בחר הכל'));
    expect(all).toHaveBeenCalledOnce();
    expect(toggle).not.toHaveBeenCalled();
    expect(screen.getByText('3 נבחרו')).toBeTruthy();
  });
});
