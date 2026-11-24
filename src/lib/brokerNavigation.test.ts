import { describe, expect, it } from 'vitest';
import { BROKER_MENU_ORDER, BROKER_NAV_PATHS } from './brokerNavigation';

describe('broker sidebar navigation', () => {
  it('keeps the exact requested broker menu order', () => {
    expect(BROKER_MENU_ORDER).toEqual([
      '/',
      '/properties',
      '/my-ads',
      '/command-center',
      '/signatures',
      '/inbox',
      '/campaigns',
      '/referral',
      'accessibility',
    ]);
  });

  it('does not expose dashboard or activity history as broker sidebar destinations', () => {
    expect(BROKER_NAV_PATHS).not.toContain('/dashboard');
    expect(BROKER_NAV_PATHS).not.toContain('/activity-history');
  });
});
