import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImportCommissionDialog } from './ImportCommissionDialog';
import { DEFAULT_IMPORT_RULE, type ImportDealType } from '@/lib/importCommissionDefaults';

vi.mock('@/pages/Terms', () => ({ default: () => null }));
afterEach(cleanup);
function Harness({ types, apply }: { types: ImportDealType[]; apply: (accepted: boolean) => void }) {
  const [rule, setRule] = useState(DEFAULT_IMPORT_RULE);
  return <ImportCommissionDialog open onOpenChange={vi.fn()} count={2} types={types} rule={rule} onRuleChange={setRule} onApply={apply} saving={false} />;
}
describe('batch import agreement and modes', () => {
  it('requires affirmative checkbox acceptance before applying fees', () => {
    const apply = vi.fn();
    render(<Harness types={['sale']} apply={apply} />);
    fireEvent.click(screen.getByRole('button', { name: 'אישור והחלה' }));
    expect(apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'אישור והחלה' }));
    expect(apply).toHaveBeenCalledWith(true);
  });
  it('switches mixed inventory from default 0.5% sale to default 20% rent without losing the sale setting', () => {
    render(<Harness types={['sale', 'rent']} apply={vi.fn()} />);
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('0.5');
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'End' });
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'השכרה' }), { button: 0, ctrlKey: false });
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('20');
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'Home' });
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('10');
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'מכירה' }), { button: 0, ctrlKey: false });
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('2');
  });
  it('rental-only inventory configures the rental rule immediately', () => {
    render(<Harness types={['rent']} apply={vi.fn()} />);
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'End' });
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('100');
  });
});describe('sale/rent tabs visibility', () => {
  it('hides tabs for a sale-only batch', () => {
    render(<Harness types={['sale']} apply={vi.fn()} />);
    expect(screen.queryByRole('tab')).toBeNull();
  });
  it('shows both tabs for a mixed batch', () => {
    render(<Harness types={['sale', 'rent']} apply={vi.fn()} />);
    expect(screen.getAllByRole('tab')).toHaveLength(2);
  });
});
describe('shekels first with the percentage in parentheses', () => {
  const prices = { sale: 2000000, rent: 6000 };
  function Priced({ types, apply = vi.fn() }: { types: ImportDealType[]; apply?: (accepted: boolean) => void }) {
    const [rule, setRule] = useState(DEFAULT_IMPORT_RULE);
    return <ImportCommissionDialog open onOpenChange={vi.fn()} count={3} types={types} rule={rule} onRuleChange={setRule} onApply={apply} saving={false} prices={prices} />;
  }
  it('shows the sale closing fee in shekels first, then the percentage, with shekel slider bounds', () => {
    render(<Priced types={['sale']} />);
    expect(screen.getByText('₪10,000 (0.5%)')).toBeTruthy();
    expect(screen.getByText('₪4,000 (0.2%)')).toBeTruthy();
    expect(screen.getByText('₪40,000 (2%)')).toBeTruthy();
  });
  it('shows the rent closing fee in shekels first, then the percentage, with shekel slider bounds', () => {
    render(<Priced types={['sale', 'rent']} />);
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'השכרה' }), { button: 0, ctrlKey: false });
    expect(screen.getByText('₪1,200 (20%)')).toBeTruthy();
    expect(screen.getByText('₪600 (10%)')).toBeTruthy();
    expect(screen.getByText('₪6,000 (100%)')).toBeTruthy();
  });
  it('keeps the percentage alone when no base price is available', () => {
    render(<Harness types={['sale']} apply={vi.fn()} />);
    expect(screen.getByText('0.5%')).toBeTruthy();
    expect(screen.getByText('0.2%')).toBeTruthy();
    expect(screen.getByText('2%')).toBeTruthy();
  });
});
