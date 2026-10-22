import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LeadPriceSlider } from './LeadPriceSlider';
import type { LeadPriceKey } from '@/lib/leadPriceRanges';

function Harness({ tier }: { tier: LeadPriceKey }) {
  const [value, setValue] = useState('');
  return <><LeadPriceSlider tier={tier} label="פנייה" value={value} onChange={setValue} /><output data-testid="saved">{value}</output></>;
}
describe('publisher lead prices', () => {
  it.each([['form', 40, 150], ['whatsapp', 50, 200], ['phone', 80, 250]] as const)('%s enables at minimum and saves manual bounded prices', (tier, min, max) => {
    render(<Harness tier={tier} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(screen.getByTestId('saved').textContent).toBe(String(min));
    fireEvent.click(screen.getByRole('button', { name: 'עריכת עמלה עבור פנייה' }));
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: String(max - 1) } });
    fireEvent.submit(screen.getByRole('spinbutton').closest('form') as HTMLFormElement);
    expect(screen.getByTestId('saved').textContent).toBe(String(max - 1));
    fireEvent.click(screen.getByRole('switch'));
    expect(screen.getByTestId('saved').textContent).toBe('');
  });
});