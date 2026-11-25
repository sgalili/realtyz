import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgencyDescriptionField } from './AgencyDescriptionField';

describe('AgencyDescriptionField', () => {
  it('edits the imported company description and saves the confirmed text', () => {
    const onChange = vi.fn();
    const onSave = vi.fn();
    render(<AgencyDescriptionField value="תיאור מעודכן" savedValue="תיאור מיובא" disabled={false} saving={false} onChange={onChange} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText('תוכן תיאור החברה'), { target: { value: 'תיאור חדש' } });
    fireEvent.click(screen.getByRole('button', { name: 'שמירה' }));
    expect(onChange).toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledOnce();
  });
});
