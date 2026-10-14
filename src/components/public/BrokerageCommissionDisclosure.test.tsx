import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import BrokerageCommissionDisclosure from './BrokerageCommissionDisclosure';
import Terms from '@/pages/Terms';

describe('public brokerage commission disclosure', () => {
  it('shows buyer/renter fees and links directly to their terms without partner rewards', () => {
    render(<MemoryRouter><BrokerageCommissionDisclosure /></MemoryRouter>);
    expect(screen.getByText('קונים: 1% בלבד')).toBeInTheDocument();
    expect(screen.getByText('שוכרים: 10% בלבד')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'תנאי התיווך' })).toHaveAttribute('href', '/terms#brokerage-commissions');
    expect(screen.getByRole('complementary')).not.toHaveTextContent('80%');
    expect(screen.getByRole('complementary')).toHaveTextContent('הסכמים החתומים');
  });
  it('publishes a readable dedicated legal section with signed-agreement conditions', () => {
    render(<MemoryRouter><Terms /></MemoryRouter>);
    const heading = screen.getByRole('heading', { name: 'עמלות תיווך ותנאי שירות (Brokerage Commissions)' });
    const section = heading.closest('section');
    expect(section).toHaveAttribute('id', 'brokerage-commissions');
    expect(section).toHaveTextContent('1% בלבד ממחיר העסקה הסופי');
    expect(section).toHaveTextContent('10% בלבד מדמי השכירות החודשיים');
    expect(section).toHaveTextContent('מוכרים ומשכירים');
    expect(section).toHaveTextContent('הזמנת שירותי תיווך בכתב');
  });
});