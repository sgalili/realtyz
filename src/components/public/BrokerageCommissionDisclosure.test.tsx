import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import BrokerageCommissionDisclosure from './BrokerageCommissionDisclosure';
import Terms from '@/pages/Terms';

describe('public brokerage commission disclosure', () => {
  it('renders nothing without a workflow audience', () => {
    const { container } = render(<MemoryRouter><BrokerageCommissionDisclosure /></MemoryRouter>);
    expect(container).toBeEmptyDOMElement();
  });
  it.each(['buyer', 'renter', 'seller', 'landlord'] as const)('shows only the relevant notice for %s', (audience) => {
    render(<MemoryRouter><BrokerageCommissionDisclosure audience={audience} /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'תנאי התיווך' })).toHaveAttribute('href', '/terms#brokerage-commissions');
    expect(screen.getByRole('complementary')).not.toHaveTextContent('80%');
    const notice = screen.getByRole('complementary');
    expect(notice).not.toHaveTextContent('לעומת');
    if (audience === 'buyer') { expect(notice).toHaveTextContent('1%'); expect(notice).not.toHaveTextContent('10%'); }
    else if (audience === 'renter') { expect(notice).toHaveTextContent('10%'); expect(notice).not.toHaveTextContent('לקונים'); }
    else { expect(notice).toHaveTextContent('הסכם התיווך הספציפי החתום'); expect(notice).not.toHaveTextContent('%'); }
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