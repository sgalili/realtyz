import { describe, expect, it } from 'vitest';
import { buildWalkthrough, walkthroughStore } from './appWalkthrough';

describe('global walkthrough', () => {
  it('starts with the concept and ends with completion', () => {
    const steps = buildWalkthrough([]);
    expect(steps[0].title).toBe('ברוכים הבאים לרילטיז');
    expect(steps.at(-1)?.title).toBe('יוצאים לדרך');
    expect(steps.some((step) => step.title.includes('ריטה'))).toBe(true);
  });
  it('uses only rendered menus, deduplicates and excludes unknown/admin screens', () => {
    const steps = buildWalkthrough([{ path: '/developer-dashboard', title: 'פרויקטים' }, { path: '/developer-dashboard', title: 'כפול' }, { path: '/super-admin', title: 'ניהול' }]);
    expect(steps.filter((step) => step.sidebar && step.selector?.includes('/developer-dashboard'))).toHaveLength(1);
    expect(steps.some((step) => step.path === '/properties' || step.path === '/deal-room' || step.path === '/super-admin')).toBe(false);
    expect(steps.some((step) => step.selector === '[aria-label="הוספת פרויקט"]')).toBe(true);
  });
  it('does not introduce broker/closing screens into a partner tour', () => {
    const steps = buildWalkthrough([{ path: '/affiliate-network', title: 'שיווק שותפים' }, { path: '/partner/contacts', title: 'לידים' }]);
    expect(steps.some((step) => step.path === '/deal-room' || step.path === '/lead-crm')).toBe(false);
    for (const phrase of ['80%', '20%', 'עמלת סגירה', 'מה השותף רואה']) expect(JSON.stringify(steps)).not.toContain(phrase);
  });
  it('retains the active step across hosts and can replay after completion', () => {
    const steps = buildWalkthrough([]);
    walkthroughStore.start(steps, '/profile', 'u1', 'ws1');
    walkthroughStore.move(2);
    expect(walkthroughStore.get()?.index).toBe(2);
    walkthroughStore.move(999);
    expect(walkthroughStore.get()?.index).toBe(2);
    walkthroughStore.stop();
    expect(walkthroughStore.get()).toBeNull();
    walkthroughStore.start(steps, '/public-listings', 'u1', 'ws1');
    expect(walkthroughStore.get()?.index).toBe(0);
    walkthroughStore.stop();
  });
});