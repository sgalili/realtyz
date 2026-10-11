import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SelectAllRow, SelectModeToggle } from './multi-select-controls';

afterEach(cleanup);
describe('empty-safe selection menu', () => {
  it('hides the menu and header for zero rows', () => {
    render(<><SelectModeToggle total={0} active={false} onToggle={vi.fn()} onSelectAll={vi.fn()} /><SelectAllRow total={0} selected={0} onToggle={vi.fn()} /></>);
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('supports selecting individuals without bulk selecting', async () => {
    const toggle = vi.fn(), all = vi.fn();
    render(<SelectModeToggle total={2} active={false} onToggle={toggle} onSelectAll={all} />);
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'בחר פריטים' }));
    expect(toggle).toHaveBeenCalledOnce();
    expect(all).not.toHaveBeenCalled();
  });
  it('supports select all without toggling off an active mode', async () => {
    const toggle = vi.fn(), all = vi.fn();
    render(<SelectModeToggle total={2} active onToggle={toggle} onSelectAll={all} />);
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'בחר הכל' }));
    expect(toggle).not.toHaveBeenCalled();
    expect(all).toHaveBeenCalledOnce();
  });
});