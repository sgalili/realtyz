import { describe, expect, it } from 'vitest';
import { scrapingAlerts, type ScrapingReport } from './scrapingReport';
const report = (alerts: Partial<ScrapingReport['alerts']>) => ({ alerts: { provider_denials:0, stalled_calls:0, errors_today:0, empty_runs:0, last_scheduled_run:null, ...alerts } } as ScrapingReport);
describe('non-disruptive scraping alerts', () => {
  it('reports provider denials', () => expect(scrapingAlerts(report({ provider_denials:2 }))).toHaveLength(1));
  it('reports calls without completion', () => expect(scrapingAlerts(report({ stalled_calls:1 }))).toHaveLength(1));
  it('does not report errors without evidence', () => expect(scrapingAlerts(report({}))).toEqual([]));
  it('flags scheduled refresh older than 26 hours', () => expect(scrapingAlerts(report({ last_scheduled_run:new Date(Date.now()-27*3600000).toISOString() }))).toHaveLength(1));
  it('does not flag a recent scheduled refresh', () => expect(scrapingAlerts(report({ last_scheduled_run:new Date().toISOString() }))).toEqual([]));
});