import { describe, expect, it } from 'vitest';
import { TUTORIALS, tutorialForPath } from './tutorials';

describe('sanitized tutorials', () => {
  it('does not explain internal splits, visibility or account restriction rules', () => {
    const text = JSON.stringify(TUTORIALS);
    for (const phrase of ['80%', '20%', '100%', 'מה השותף רואה', 'אינם מתווכים', 'שאינו מתווך', 'ננעל', 'החשבון מוגבל', 'עמלת סגירה']) {
      expect(text).not.toContain(phrase);
    }
  });
  it('keeps partner slides focused on personal sharing, tracking and wallet actions', () => {
    const tutorial = tutorialForPath('/affiliate-network');
    expect(tutorial?.slides).toHaveLength(3);
    expect(JSON.stringify(tutorial)).toContain('**העתקת קישור אישי**');
    expect(JSON.stringify(tutorial)).toContain('**בארנק**');
  });
});