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
});