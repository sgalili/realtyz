import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { IsraeliCityPicker } from './IsraeliCityPicker';
it('keeps multiple selected service areas when adding the nationwide option', () => {
  const change = vi.fn();
  render(<IsraeliCityPicker value="" onChange={() => {}} selectedValues={['חיפה']} onSelectionChange={change} firstOptions={['כל הארץ']} />);
  fireEvent.click(screen.getByRole('combobox'));
  fireEvent.click(screen.getByRole('checkbox', { name: 'כל הארץ' }));
  expect(change).toHaveBeenCalledWith(['חיפה', 'כל הארץ']);
});