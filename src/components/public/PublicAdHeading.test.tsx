import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PublicAdHeading from './PublicAdHeading';

const LONG_TITLE = 'דירת 4 חדרים משופצת בקומה 14, כ-100 מ"ר, עם ממ"ק קומתי בהרצליה';

describe('property title heading', () => {
  it('renders the complete title text including the city name', () => {
    render(<PublicAdHeading title={LONG_TITLE} price="₪2,450,000" dealType="sale" />);
    expect(screen.getByText(LONG_TITLE)).toBeInTheDocument();
  });

  it('wraps the title instead of truncating it', () => {
    render(<PublicAdHeading title={LONG_TITLE} price="₪2,450,000" dealType="sale" />);
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading.className).toContain('whitespace-normal');
    expect(heading.className).toContain('break-words');
    expect(heading.className).not.toMatch(/truncate|line-clamp/);
  });

  it('keeps the price on one line', () => {
    const { container } = render(<PublicAdHeading title={LONG_TITLE} price="₪12,000" dealType="rent" />);
    const price = container.querySelector('[data-ad-heading] p');
    expect(price?.textContent).toContain('₪12,000');
    expect(price?.className).toContain('whitespace-nowrap');
  });
});

const TITLE_RENDERERS = [
  'src/components/public/PublicAdHeading.tsx',
  'src/pages/PublicListingsBoard.tsx',
  'src/pages/PropertiesHub.tsx',
  'src/pages/Properties.tsx',
  'src/pages/DeveloperDashboard.tsx',
  'src/pages/AffiliatePortal.tsx',
  'src/pages/CampaignCenter.tsx',
  'src/pages/CommandCenter.tsx',
  'src/components/GlobalSearch.tsx',
  'src/components/PendingListingsCard.tsx',
  'src/components/transparency/TransparencyResults.tsx',
  'src/components/affiliate/LeftoverLeadsDialog.tsx',
  'src/components/affiliate/PartnerPropertyModal.tsx',
  'src/components/properties/ProjectAlternativesCard.tsx',
  'src/components/properties/ShareWithLeadDialog.tsx',
  'src/components/properties/ImportProgressDialog.tsx',
  'src/components/properties/QuickPublicPromotion.tsx',
];

const TITLE_EXPRESSIONS = [
  'publicAdTitle(',
  'cleanTitle(',
  'property_title',
  'property.title',
  'row.title',
  's.title',
  'r.title',
  'it.title',
  'unit.title',
  'result.title',
  'task.listingMeta',
];

describe('property titles are never truncated anywhere', () => {
  it.each(TITLE_RENDERERS)('%s renders property titles without ellipsis styles', (file) => {
    const lines = readFileSync(resolve(process.cwd(), file), 'utf8').split('\n');
    const offenders = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => TITLE_EXPRESSIONS.some((expression) => line.includes(expression)))
      .filter(({ line }) => /truncate|line-clamp/.test(line))
      .map(({ index, line }) => `${file}:${index + 1} ${line.trim().slice(0, 90)}`);
    expect(offenders).toEqual([]);
  });
});
