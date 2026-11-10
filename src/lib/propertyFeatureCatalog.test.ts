import { describe, it, expect } from 'vitest';
import { toggleFeature } from './propertyFeatureCatalog';

describe('toggleFeature', () => {
  it('keeps property condition to a single choice', () => {
    expect(toggleFeature(['משופצת', 'מחסן'], 'שמור', true)).toEqual(['מחסן', 'שמור']);
  });
  it('allows several air directions together', () => {
    expect(toggleFeature(['פונה צפונה'], 'פונה דרומה', true)).toEqual(['פונה צפונה', 'פונה דרומה']);
  });
});
