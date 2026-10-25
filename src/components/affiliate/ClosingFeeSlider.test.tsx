import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClosingFeeSlider } from './ClosingFeeSlider';
afterEach(cleanup);
describe('closing fee interaction', () => {
  it('allows a Super Admin editor to set a 5% sale fee beyond the standard range', () => {
    const change = vi.fn();
    render(<ClosingFeeSlider unrestricted dualMode dealType="sale" price={2000000} value={1} onChange={vi.fn()} onValueChange={change} />);
    fireEvent.click(screen.getByRole('button', { name: 'עריכת עמלת סגירה' }));
    const input = screen.getByRole('textbox', { name: 'עריכת עמלת סגירה' });
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.blur(input);
    expect(change).toHaveBeenCalledWith(5, 'percent');
  });
  it('allows a Super Admin editor to explicitly disable the closing fee with zero', () => {
    const change = vi.fn();
    render(<ClosingFeeSlider unrestricted dualMode dealType="sale" price={2000000} value={1} onChange={vi.fn()} onValueChange={change} />);
    fireEvent.click(screen.getByRole('button', { name: 'עריכת עמלת סגירה' }));
    const input = screen.getByRole('textbox', { name: 'עריכת עמלת סגירה' });
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.blur(input);
    expect(change).toHaveBeenCalledWith(0, 'percent');
  });
  it('starts expanded and collapsing preserves the configured fee', () => {
    const change = vi.fn();
    render(<ClosingFeeSlider dealType="sale" price={2000000} value={1} onChange={change} />);
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: 'כווץ את עמלת התיווך' }));
    expect(screen.queryByRole('slider')).toBeNull();
    expect(change).not.toHaveBeenCalled();
  });
  it('sale fees are always saved as a percentage bounded to 0.2%-2%', () => {
    const change = vi.fn();
    render(<ClosingFeeSlider dualMode dealType="sale" price={2000000} value={20000} valueType="fixed" onChange={vi.fn()} onValueChange={change} />);
    fireEvent.click(screen.getByRole('button', { name: 'עריכת עמלת סגירה' }));
    const input = screen.getByRole('textbox', { name: 'עריכת עמלת סגירה' });
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.blur(input);
    expect(change).toHaveBeenCalledWith(2, 'percent');
    expect(screen.getByRole('slider').getAttribute('aria-valuemin')).toBe('0.2');
    expect(screen.getByRole('slider').getAttribute('aria-valuemax')).toBe('2');
  });
  it('rent fees are always saved in ILS, never percent', () => {
    const change = vi.fn();
    render(<ClosingFeeSlider dualMode dealType="rent" price={6000} value={50} valueType="percent" onChange={vi.fn()} onValueChange={change} />);
    fireEvent.click(screen.getByRole('button', { name: 'עריכת עמלת סגירה' }));
    const input = screen.getByRole('textbox', { name: 'עריכת עמלת סגירה' });
    fireEvent.change(input, { target: { value: '3000' } });
    fireEvent.blur(input);
    expect(change).toHaveBeenCalledWith(3000, 'fixed');
  });
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
  it('closing amounts always display as whole shekels without decimals', () => {
    render(<ClosingFeeSlider dualMode dealType="rent" price={5333} value={50} valueType="percent" onChange={vi.fn()} onValueChange={vi.fn()} />);
    expect(screen.getByText('₪2,667')).toBeTruthy();
    expect(screen.queryByText(/2,666\.5/)).toBeNull();
  });
});