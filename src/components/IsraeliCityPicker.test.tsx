import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { IsraeliCityPicker, normalizeCitySelection, toggleCitySelection } from './IsraeliCityPicker';
it('clears individual cities when selecting the nationwide option', () => {
  const change = vi.fn();
  render(<IsraeliCityPicker value="" onChange={() => {}} selectedValues={['חיפה']} onSelectionChange={change} firstOptions={['כל הארץ']} />);
  fireEvent.click(screen.getByRole('combobox'));
  fireEvent.change(screen.getByRole('textbox', { name: 'חיפוש עיר' }), { target: { value: 'כל הארץ' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'כל הארץ' }));
  expect(change).toHaveBeenCalledWith(['כל הארץ']);
});
it('clears nationwide selection when selecting an individual city', () => {
  expect(toggleCitySelection(['כל הארץ'], 'חיפה')).toEqual(['חיפה']);
});
it('never expands nationwide coverage into city selections', () => {
  expect(normalizeCitySelection(['חיפה', 'תל אביב', 'כל הארץ'])).toEqual(['כל הארץ']);
});
it('removes nationwide selection when a custom area is added', () => {
  const change = vi.fn();
  render(<IsraeliCityPicker value="" onChange={() => {}} selectedValues={['כל הארץ']} onSelectionChange={change} firstOptions={['כל הארץ']} />);
  fireEvent.click(screen.getByRole('combobox'));
  fireEvent.change(screen.getByRole('textbox', { name: 'חיפוש עיר' }), { target: { value: 'כל הארץ' } });
  fireEvent.click(screen.getByRole('button', { name: 'אחר (טקסט חופשי)' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'עיר או אזור אחר' }), { target: { value: 'הגליל' } });
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'עיר או אזור אחר' }), { key: 'Enter' });
  expect(change).toHaveBeenCalledWith(['הגליל']);
});