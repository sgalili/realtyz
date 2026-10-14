import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AffiliateProgramHelp } from './AffiliateProgramHelp';

let licensed = false;
vi.mock('@/hooks/useAffiliateLicense', () => ({ useAffiliateLicense: () => ({ level4Unlocked: licensed }) }));

describe('affiliate program help', () => {
  it('opens and closes the guide without consent or unauthorized closing information', () => {
    licensed = false;
    render(<AffiliateProgramHelp />);
    fireEvent.click(screen.getByRole('button', { name: 'איך עובד שיווק השותפים' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('לידים עודפים')).toBeInTheDocument();
    expect(screen.getByText('משתפים קישור אישי')).toBeInTheDocument();
    expect(screen.queryByText(/תגמול על סגירת עסקה/)).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'הבנתי' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('shows closing guidance only when authorized', () => {
    licensed = true;
    render(<AffiliateProgramHelp />);
    fireEvent.click(screen.getByRole('button', { name: 'איך עובד שיווק השותפים' }));
    expect(screen.getByText(/תגמול על סגירת עסקה/)).toBeInTheDocument();
  });
});