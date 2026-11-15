import { afterEach, describe, expect, it } from 'vitest';
import { shouldAutoOpenTutorial, TUTORIALS, tutorialForPath, tutorialStore } from './tutorials';

afterEach(() => {
  tutorialStore.setUser('tutorial-test-a');
  tutorialStore.restoreAll(true);
  tutorialStore.setUser('tutorial-test-b');
  tutorialStore.restoreAll(true);
  tutorialStore.setUser(null);
});

describe('page tutorials', () => {
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

  it('provides specific homepage and My Ads guides with a global icon on every slide', () => {
    expect(tutorialForPath('/')?.id).toBe('page:/public-listings');
    expect(tutorialForPath('/public-listings')?.title).toBe('לוח השותפים של המדינה');
    expect(tutorialForPath('/my-ads')?.title).toBe('המודעות שלי');
    for (const tutorial of Object.values(TUTORIALS)) {
      for (const slide of tutorial.slides) {
        expect(slide.icon).toBeTruthy();
        expect(slide.icon).not.toBe('guide');
        expect(slide).not.toHaveProperty('emoji');
      }
    }
  });

  it('reopens a seen page on later visits and stops only after explicit dismissal', () => {
    tutorialStore.setUser('tutorial-test-a');
    tutorialStore.restoreAll(true);
    expect(shouldAutoOpenTutorial(tutorialStore.get(), 'page:/dashboard')).toBe(true);
    tutorialStore.markSeen('page:/dashboard');
    expect(shouldAutoOpenTutorial(tutorialStore.get(), 'page:/dashboard')).toBe(true);
    tutorialStore.dismiss('page:/dashboard');
    expect(shouldAutoOpenTutorial(tutorialStore.get(), 'page:/dashboard')).toBe(false);
  });

  it('stores suppression separately for each user', () => {
    tutorialStore.setUser('tutorial-test-a');
    tutorialStore.restoreAll(true);
    tutorialStore.dismiss('page:/profile');
    tutorialStore.setUser('tutorial-test-b');
    tutorialStore.restoreAll(true);
    expect(shouldAutoOpenTutorial(tutorialStore.get(), 'page:/profile')).toBe(true);
    tutorialStore.setUser('tutorial-test-a');
    expect(shouldAutoOpenTutorial(tutorialStore.get(), 'page:/profile')).toBe(false);
  });
});
