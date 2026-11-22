import { describe, expect, it } from 'vitest';
import { advanceExternalFailedSource, fatalImportFailure, finishFailedImportItem, IMPORT_ITEM_ATTEMPTS, recordImportItemFailure } from '../../supabase/functions/_shared/importItemFailure';

describe('item-local import continuation', () => {
  it('allows three attempts per URL, unaffected by another URL succeeding', () => {
    const c: Record<string, any> = { phase: 'importing' };
    expect(IMPORT_ITEM_ATTEMPTS).toBe(3);
    expect(recordImportItemFailure(c, 'a', 'timeout', 504).retry).toBe(true);
    c.transientRetries = 0;
    recordImportItemFailure(c, 'b', 'gateway', 502);
    expect(recordImportItemFailure(c, 'a', 'timeout', 504).retry).toBe(true);
    expect(recordImportItemFailure(c, 'a', 'timeout', 504)).toEqual({ attempt: 3, retry: false });
  });
  it('consumes the failed draft, preserving broker identity and successful drafts', () => {
    const c: Record<string, any> = { activeBroker: { broker_id: 'b', listing_urls: ['saved', 'bad', 'next'] }, workerListingDoneUrls: ['saved'] };
    recordImportItemFailure(c, 'bad', 'timeout', 504);
    expect(advanceExternalFailedSource(c, 'bad')).toBe(true);
    finishFailedImportItem(c);
    expect(c.activeBroker.broker_id).toBe('b');
    expect(c.workerListingDoneUrls).toEqual(['saved', 'bad']);
    expect(c.failedSourceVersion).toBe(1);
    expect(c.lastFailedSource.url).toBe('bad');
    expect(c.waitUntil).toBeNull();
  });
  it('skips only the failed project page, not its developer or other units', () => {
    const c: Record<string, any> = { workerDeveloper: { pendingUrls: ['project-a', 'project-b'], projects: [{ id: 'saved' }] }, workerProcessed: [] };
    expect(advanceExternalFailedSource(c, 'project-a')).toBe(true);
    expect(c.workerDeveloper.pendingUrls).toEqual(['project-b']);
    expect(c.workerDeveloper.projects).toEqual([{ id: 'saved' }]);
    expect(c.workerProcessed).toEqual([]);
  });
  it('continues to the next identity after an entity failure', () => {
    const c: Record<string, any> = { workerEntities: [{ kind: 'developer', url: 'bad' }, { kind: 'broker', url: 'next' }], workerProcessed: [] };
    expect(advanceExternalFailedSource(c, 'bad')).toBe(true);
    expect(c.workerProcessed).toEqual(['bad']);
    expect(advanceExternalFailedSource(c, 'unmatched')).toBe(false);
  });
  it('does not repeatedly read a failed directory or broker pagination URL', () => {
    const c: Record<string, any> = { workerFrontier: ['bad', 'next'], workerBrokerPageUrls: ['page2', 'page3'] };
    expect(advanceExternalFailedSource(c, 'bad')).toBe(true);
    expect(c.workerFrontier).toEqual(['next']);
    expect(advanceExternalFailedSource(c, 'page2')).toBe(true);
    expect(c.workerBrokerFailedPages).toEqual(['page2']);
  });
  it('keeps rate limits bounded too, without bypassing authorization/billing', () => {
    const c = {};
    for (let i = 1; i <= 3; i++) expect(recordImportItemFailure(c, 'url', 'rate limit', 429).retry).toBe(i < 3);
    expect(fatalImportFailure(407, 'account suspended')).toBe(true);
    expect(fatalImportFailure(403, 'forbidden')).toBe(true);
    expect(fatalImportFailure(504, 'Bright Data TimeoutError')).toBe(false);
  });
});