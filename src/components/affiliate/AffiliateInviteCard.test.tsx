import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AffiliateInviteCard } from './AffiliateInviteCard';
vi.mock('@/hooks/useInviteBonusSettings', () => ({ INVITE_BONUS_DEFAULTS: { referrer_credits: 200, friend_credits: 100 }, useInviteBonusSettings: () => ({ data: undefined }) }));

const personalGender = { value: null as 'male' | 'female' | null };
vi.mock('@/i18n/personalLanguage', async () => {
  const actual = await vi.importActual<typeof import('@/i18n/personalLanguage')>('@/i18n/personalLanguage');
  return { ...actual, usePersonalLanguage: () => ({ gender: personalGender.value, command: () => undefined }) };
});

vi.mock('@/hooks/useReferralProgram', () => ({ useReferralProgram: () => ({ data: { code: 'INVITE7', total: 0, earned_ils: 0, verified_deals: 0 }, isLoading: false, isError: false }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('dual-win invitations', () => {
  beforeEach(() => vi.restoreAllMocks());
  it('shows both rewards and the approved-deal condition, without subscription offers', () => {
    render(<AffiliateInviteCard />);
    expect(screen.getByText('200')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getAllByText('קרדיטים לארנק')).toHaveLength(2);
    expect(screen.getByText(/הרשמה בלבד אינה מזכה/)).toBeInTheDocument();
    expect(screen.queryByText(/50%|Pro|₪15/)).not.toBeInTheDocument();
  });
  it('shows the masculine inviter label by default with no link field', () => {
    render(<AffiliateInviteCard />);
    expect(screen.getByText('לך · המזמין')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
  it('shows the feminine inviter label for a female user', () => {
    personalGender.value = 'female';
    render(<AffiliateInviteCard />);
    expect(screen.getByText('לך · המזמינה')).toBeInTheDocument();
    expect(screen.queryByText('לך · המזמין')).not.toBeInTheDocument();
    personalGender.value = null;
  });
  it('copies the personal canonical link', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<AffiliateInviteCard />);
    fireEvent.click(screen.getByRole('button', { name: 'העתק קישור אישי' }));
    expect(writeText).toHaveBeenCalledWith('https://toraff.co.il/ref/INVITE7');
  });
  it('shares an encoded message with safe external navigation', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<AffiliateInviteCard />);
    fireEvent.click(screen.getByRole('button', { name: 'וואטסאפ' }));
    expect(open).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/wa.me\/\?text=/), '_blank', 'noopener,noreferrer');
    fireEvent.click(screen.getByRole('button', { name: 'אימייל' }));
    expect(open).toHaveBeenLastCalledWith(expect.stringMatching(/^mailto:\?subject=/), '_blank', 'noopener,noreferrer');
  });
});