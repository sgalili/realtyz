import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CityFilterSelect } from './CityFilterSelect';
import { EMPTY_PROPERTY_FILTER } from '@/lib/leadTypeFilter';

function renderSelect() {
  const onChange = vi.fn();
  render(
    <CityFilterSelect
      cities={['תל אביב', 'חיפה']}
      state={EMPTY_PROPERTY_FILTER}
      onChange={onChange}
      preferences={{ deal: 'all' }}
    />,
  );
  return onChange;
}

describe('city filter dropdown', () => {
  it('reads בחירת ערים and hides the missing-city form until the list is opened', () => {
    renderSelect();
    expect(screen.getByRole('combobox', { name: 'אזור' })).toHaveTextContent('בחירת ערים');
    fireEvent.click(screen.getByRole('combobox', { name: 'אזור' }));
    expect(screen.getByRole('option', { name: 'כל הארץ' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('שם העיר')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('מספר וואטסאפ')).not.toBeInTheDocument();
  });

  it('keeps the missing-city row as the last row of the list and opens its form on click', () => {
    renderSelect();
    fireEvent.click(screen.getByRole('combobox', { name: 'אזור' }));
    const missing = screen.getByRole('button', { name: 'העיר שלך לא מופיעה כאן?' });
    screen.getAllByRole('option').forEach((row) => {
      expect(missing.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    });
    fireEvent.click(missing);
    expect(screen.getByPlaceholderText('שם העיר')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('מספר וואטסאפ')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: 'עדכן אותי' });
    expect(submit.querySelector('svg')).not.toBeNull();
    expect(submit).toBeDisabled();
  });

  it('selecting a city from nationwide reports just that city', () => {
    const onChange = renderSelect();
    fireEvent.click(screen.getByRole('combobox', { name: 'אזור' }));
    fireEvent.click(screen.getByRole('option', { name: 'חיפה' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ city: 'חיפה', selectedCities: ['חיפה'] }));
  });
});
