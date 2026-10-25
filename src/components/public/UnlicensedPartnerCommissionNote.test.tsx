import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import Terms from '@/pages/Terms';
import CommissionMechanism from '@/pages/CommissionMechanism';
import { UNLICENSED_PARTNER_COMMISSION_NOTE, UnlicensedPartnerCommissionNote } from './UnlicensedPartnerCommissionNote';

afterEach(cleanup);

describe('unlicensed partner commission note', () => {
  it('keeps the required wording in one shared place', () => {
    expect(UNLICENSED_PARTNER_COMMISSION_NOTE).toContain('שותף שאינו מחזיק ברישיון תיווך במקרקעין כחוק');
    expect(UNLICENSED_PARTNER_COMMISSION_NOTE).toContain('מתווך מורשה מטעם פלטפורמת TORAFF');
    expect(UNLICENSED_PARTNER_COMMISSION_NOTE).toContain('חוק המתווכים');
  });
  it('renders as a quiet footnote', () => {
    render(<UnlicensedPartnerCommissionNote />);
    const note = screen.getByText(UNLICENSED_PARTNER_COMMISSION_NOTE);
    expect(note.className).toContain('text-xs');
    expect(note.className).toContain('text-muted-foreground');
  });
  it('appears on the commission mechanism and Terms pages', () => {
    render(<MemoryRouter><CommissionMechanism /></MemoryRouter>);
    expect(screen.getByText(UNLICENSED_PARTNER_COMMISSION_NOTE)).toBeTruthy();
    cleanup();
    render(<MemoryRouter><Terms /></MemoryRouter>);
    expect(screen.getByText(UNLICENSED_PARTNER_COMMISSION_NOTE)).toBeTruthy();
  });
});
