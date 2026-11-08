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
});