import { describe, it, expect } from 'vitest';
import { missingProjectDetails, projectPublicationLabel } from './developerProjectCompleteness';

describe('developer project completeness', () => {
  it('lists stage, price, images, apartments and commissions for an empty project', () => {
    expect(missingProjectDetails({ name: 'x', apartments: [], source_details: {}, price_from: null, commission_config: {} } as never, false))
      .toEqual(['שלב בפרויקט', 'מחיר', 'תמונות', 'דירות', 'עמלות']);
  });
  it('publication label follows is_public', () => {
    expect(projectPublicationLabel({ is_public: true } as never)).toBe('מפורסם');
    expect(projectPublicationLabel({ is_public: false } as never)).toBe('טיוטה');
  });
});
