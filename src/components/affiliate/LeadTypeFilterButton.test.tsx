import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LeadTypeFilterButton from './LeadTypeFilterButton';
import { EMPTY_LEAD_FILTER, EMPTY_PROPERTY_FILTER } from '@/lib/leadTypeFilter';

const roleFlags = vi.hoisted(() => ({
  isAffiliate: false,
  isTeamMember: false,
  isDeveloper: false,
  isPropertyOwner: false,
  isPropertySeeker: false,
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/usePropertyPageAccess', () => ({
  usePropertyPageAccess: () => ({ properties: true, projects: false }),
}));
vi.mock('@/hooks/useUserRole', () => ({
  useUserRole: () => ({
    isAffiliate: roleFlags.isAffiliate,
    isTeamMember: roleFlags.isTeamMember,
    isDeveloper: roleFlags.isDeveloper,
    isPropertyOwner: roleFlags.isPropertyOwner,
    isPropertySeeker: roleFlags.isPropertySeeker,
  }),
}));

function setRole(role: 'partner' | 'broker' | 'developer' | 'private') {
  roleFlags.isAffiliate = role === 'partner';
  roleFlags.isTeamMember = role === 'broker';
  roleFlags.isDeveloper = role === 'developer';
  roleFlags.isPropertyOwner = role === 'private';
  roleFlags.isPropertySeeker = false;
}

function renderFilter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
    <LeadTypeFilterButton
      state={EMPTY_LEAD_FILTER}
      onChange={() => {}}
      propertyState={EMPTY_PROPERTY_FILTER}
      onPropertyChange={() => {}}
      cities={['תל אביב']}
      neighborhoods={['פלורנטין']}
      propertyTypes={['דירה']}
    />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'סינון מתקדם' }));
}

describe('role-based advanced filter fields', () => {
  it('partner sees lead types 1-3, lead value and only the minimal property fields', () => {
    setRole('partner');
    renderFilter();
    expect(screen.getByRole('button', { name: 'פנייה דרך טופס בעמוד נחיתה' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'פנייה לאחר סינון בווטסאפ עם ריטה AI' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'פנייה לאחר סינון בטלפון עם ריטה AI' })).toBeInTheDocument();
    expect(screen.queryByText('עמלת תיווך עבור סגירת עסקה')).not.toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'פנייה דרך טופס בעמוד נחיתה' }));
    expect(screen.getByRole('slider')).toBeInTheDocument();
    expect(screen.getByText('סוג עסקה')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'אזור' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'שכונה' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'מחיר מינימום' })).toBeInTheDocument();
    // Minimal set: no rooms/size/floor for partners.
    expect(screen.queryByRole('spinbutton', { name: 'חדרים מינימום' })).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: 'שטח מינימום' })).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: 'קומה מינימום' })).not.toBeInTheDocument();
  });

  it('broker sees the deal-closing tier and the full property set', () => {
    setRole('broker');
    renderFilter();
    expect(screen.getByText('עמלת תיווך עבור סגירת עסקה')).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'חדרים מינימום' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'שטח מינימום' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'קומה מינימום' })).toBeInTheDocument();
  });

  it('developer sees only market/property filters, never lead filters', () => {
    setRole('developer');
    renderFilter();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.queryByRole('slider', { name: 'סליידר עמלה עבור שווי ליד מינימלי' })).not.toBeInTheDocument();
    expect(screen.getByText('פרטי הנכס')).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'קומה מינימום' })).toBeInTheDocument();
  });

  it('private user sees a compact market set without lead filters', () => {
    setRole('private');
    renderFilter();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.getByText('סוג עסקה')).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'חדרים מינימום' })).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: 'שטח מינימום' })).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: 'קומה מינימום' })).not.toBeInTheDocument();
  });
});
