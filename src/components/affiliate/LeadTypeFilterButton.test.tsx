import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
  render(
    <LeadTypeFilterButton
      state={EMPTY_LEAD_FILTER}
      onChange={() => {}}
      propertyState={EMPTY_PROPERTY_FILTER}
      onPropertyChange={() => {}}
      cities={['תל אביב']}
      neighborhoods={['פלורנטין']}
      propertyTypes={['דירה']}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'סינון מתקדם' }));
}

describe('role-based advanced filter fields', () => {
  it('partner sees lead types 1-3, lead value and only the minimal property fields', () => {
    setRole('partner');
    renderFilter();
    expect(screen.getByText('סוג הליד')).toBeInTheDocument();
    expect(screen.getByText('שדות בטופס דף נחיתה')).toBeInTheDocument();
    expect(screen.getByText('סינון בווטסאפ')).toBeInTheDocument();
    expect(screen.getByText('שיחת טלפון')).toBeInTheDocument();
    expect(screen.queryByText('סגירת עסקה')).not.toBeInTheDocument();
    expect(screen.getByText('שווי הליד (₪)')).toBeInTheDocument();
    expect(screen.getByText('סוג עסקה')).toBeInTheDocument();
    expect(screen.getByText('עיר')).toBeInTheDocument();
    expect(screen.getByText('שכונה')).toBeInTheDocument();
    expect(screen.getByText(/^מחיר \(₪\)$/)).toBeInTheDocument();
    // Minimal set: no rooms/size/floor for partners.
    expect(screen.queryByText('חדרים')).not.toBeInTheDocument();
    expect(screen.queryByText(/^שטח/)).not.toBeInTheDocument();
    expect(screen.queryByText('קומה')).not.toBeInTheDocument();
  });

  it('broker sees the deal-closing tier and the full property set', () => {
    setRole('broker');
    renderFilter();
    expect(screen.getByText('סגירת עסקה')).toBeInTheDocument();
    expect(screen.getByText('חדרים')).toBeInTheDocument();
    expect(screen.getByText(/^שטח/)).toBeInTheDocument();
    expect(screen.getByText('קומה')).toBeInTheDocument();
  });

  it('developer sees only market/property filters, never lead filters', () => {
    setRole('developer');
    renderFilter();
    expect(screen.queryByText('סוג הליד')).not.toBeInTheDocument();
    expect(screen.queryByText('שווי הליד (₪)')).not.toBeInTheDocument();
    expect(screen.getByText('פרטי הנכס')).toBeInTheDocument();
    expect(screen.getByText('קומה')).toBeInTheDocument();
  });

  it('private user sees a compact market set without lead filters', () => {
    setRole('private');
    renderFilter();
    expect(screen.queryByText('סוג הליד')).not.toBeInTheDocument();
    expect(screen.getByText('סוג עסקה')).toBeInTheDocument();
    expect(screen.getByText('חדרים')).toBeInTheDocument();
    expect(screen.queryByText(/^שטח/)).not.toBeInTheDocument();
    expect(screen.queryByText('קומה')).not.toBeInTheDocument();
  });
});
