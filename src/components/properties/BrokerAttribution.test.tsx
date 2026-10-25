import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import BrokerAttribution from './BrokerAttribution';

describe('Public publisher strip', () => {
  it('places commission amounts inside the strip opposite the name', () => {
    const { container } = render(<BrokerAttribution brokerName="מפרסם" trailing={<span>₪80</span>} />);
    expect(container.querySelector('[data-publisher-attribution]')).toContainElement(screen.getByText('₪80'));
    expect(screen.getByText('מפרסם')).toBeInTheDocument();
  });
  it.each([['sale', 'מוכר פרטי'], ['rent', 'משכיר פרטי']])('uses a silhouette and correct subtitle for %s', (dealType, subtitle) => {
    const { container } = render(<BrokerAttribution publisherKind="private" dealType={dealType} brokerName="מפרסם" logoUrl="https://example.com/logo.png" licenceNumber="12345" />);
    expect(screen.getByText(subtitle)).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.queryByText(/רישיון/)).not.toBeInTheDocument();
  });
  it('recognizes existing public private attribution without inferring from missing branding', () => {
    const { rerender } = render(<BrokerAttribution officeName="מפרסם פרטי" dealType="rent" />);
    expect(screen.getByText('משכיר פרטי')).toBeInTheDocument();
    rerender(<BrokerAttribution brokerName="מפרסם" />);
    expect(screen.queryByText('משכיר פרטי')).not.toBeInTheDocument();
  });
  it('renders the exclusivity label under the office name inside the same text column', () => {
    const { container } = render(<BrokerAttribution brokerName="עדן ויטמן" officeName="אנגלו סכסון הרצליה" exclusive />);
    const office = screen.getByText('אנגלו סכסון הרצליה');
    const exclusive = screen.getByText('בבלעדיות');
    const column = office.closest('.min-w-0.flex-1');
    expect(column).not.toBeNull();
    expect(column).toContainElement(exclusive);
    expect(column!.compareDocumentPosition(exclusive) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});