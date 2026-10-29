import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LeadPriceSlider } from './LeadPriceSlider';
import type { LeadPriceKey } from '@/lib/leadPriceRanges';

function Harness({ tier }: { tier: LeadPriceKey }) {
  const [value, setValue] = useState('0');
  return <><LeadPriceSlider tier={tier} label="פנייה" value={value} onChange={setValue} /><output data-testid="saved">{value}</output></>;
}
describe('publisher lead prices', () => {
  it.each([['form', 40], ['whatsapp', 50], ['phone', 80]] as const)('%s jumps to its minimum on the first slider movement and back to zero', (tier, min) => {
    render(<Harness tier={tier} />);
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' });
    expect(screen.getByTestId('saved').textContent).toBe(String(min));
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowLeft' });
    expect(screen.getByTestId('saved').textContent).toBe('0');
  });
  it('allows an enabled Super Admin editor to enter 500 beyond the form slider cap', () => {
    const change = vi.fn();
    render(<LeadPriceSlider tier="form" label="פנייה" value="100" unrestricted onChange={change} />);
    fireEvent.click(screen.getByRole('button', { name: 'עריכת עמלה עבור פנייה' }));
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '500' } });
    fireEvent.submit(screen.getByRole('spinbutton').closest('form') as HTMLFormElement);
    expect(change).toHaveBeenCalledWith('500');
  });
  it.each([['form', 40, 150], ['whatsapp', 50, 200], ['phone', 80, 250]] as const)('%s starts at zero with no automatic minimum and saves manual bounded prices', (tier, min, max) => {
    render(<Harness tier={tier} />);
    expect(screen.getByRole('button', { name: 'עריכת עמלה עבור פנייה' }).textContent).toBe('₪0');
    expect(screen.getByRole('slider').getAttribute('aria-valuemin')).toBe('0');
    fireEvent.click(screen.getByRole('button', { name: 'עריכת עמלה עבור פנייה' }));
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('0');
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: String(max - 1) } });
    fireEvent.submit(screen.getByRole('spinbutton').closest('form') as HTMLFormElement);
    expect(screen.getByTestId('saved').textContent).toBe(String(max - 1));
    expect(min).toBeLessThan(max);
  });
});
