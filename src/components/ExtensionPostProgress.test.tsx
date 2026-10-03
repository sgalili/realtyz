import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ExtensionPostProgress } from './ExtensionPostProgress';
import { FIRST_COMMENT_WARNING } from '@/lib/campaignCardHandling';

describe('extension post status', () => {
  it('shows success and a subtle warning instead of an error for comment-only failure', () => {
    const html = renderToStaticMarkup(<ExtensionPostProgress progress={{
      stage: 'failed', label: 'שגיאה', percent: 100, error: FIRST_COMMENT_WARNING, done: 0, total: 1,
    }} />);
    expect(html).toContain('aria-label="פורסם"');
    expect(html).toContain(`aria-label="${FIRST_COMMENT_WARNING}"`);
    expect(html).not.toContain('text-destructive');
    expect(html).not.toContain('שגיאה');
  });
  it('retains a real publication failure', () => {
    const html = renderToStaticMarkup(<ExtensionPostProgress progress={{
      stage: 'failed', label: 'שגיאה', percent: 100, error: 'Facebook rejected post', done: 0, total: 1,
    }} />);
    expect(html).toContain('text-destructive');
    expect(html).not.toContain('aria-label="פורסם"');
  });
});