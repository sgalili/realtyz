import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClosingFeeSlider } from './ClosingFeeSlider';
afterEach(cleanup);
describe('closing fee interaction', () => {
  it('clamps editable sale percentages to 2%', () => {
    const change = vi.fn();
    render(<ClosingFeeSlider dealType="sale" price={2000000} value={0.2} onChange={change} />);
    fireEvent.click(screen.getByRole('button', { name: 'עריכת עמלת סגירה' }));
    const input = screen.getByRole('textbox', { name: 'עריכת עמלת סגירה' });
    fireEvent.change(input, { target: { value: '3' } });
    fireEvent.blur(input);
    expect(change).toHaveBeenCalledWith(2);
  });
  it('converts editable rent of 6000 ILS to 100%', () => {
    const change = vi.fn();
    render(<ClosingFeeSlider dealType="rent" price={6000} value={10} onChange={change} />);
    fireEvent.click(screen.getByRole('button', { name: 'עריכת עמלת סגירה' }));
    const input = screen.getByRole('textbox', { name: 'עריכת עמלת סגירה' });
    fireEvent.change(input, { target: { value: '6000' } });
    fireEvent.blur(input);
    expect(change).toHaveBeenCalledWith(100);
  });
});