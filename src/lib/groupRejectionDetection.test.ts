import { readFileSync } from 'node:fs';
import { beforeEach, expect, it } from 'vitest';

const source = readFileSync('extension/poster.js', 'utf8');
const start = source.indexOf('const groupRejectionNotice = () => {');
const end = source.indexOf('\n  };', start) + 5;
const detect = new Function('document', 'visible', 'textOf', `${source.slice(start, end)}; return groupRejectionNotice();`);
const reason = () => detect(document, () => true, (el: HTMLElement) => el.textContent || '');
beforeEach(() => { document.body.innerHTML = ''; });
it('captures a scoped Facebook rejection notice', () => {
  document.body.innerHTML = '<div role="alert">Your post was declined by the group administrators</div>';
  expect(reason()).toContain('group_post_rejected:');
});
it('captures Hebrew post rejection with the source reason', () => {
  document.body.innerHTML = '<div role="status">הקמפיין שלך נדחה בגלל כללי הקבוצה</div>';
  expect(reason()).toBe('group_post_rejected: הקמפיין שלך נדחה בגלל כללי הקבוצה');
});
it('does not confuse pending moderation with rejection', () => {
  document.body.innerHTML = '<div role="alert">Your post is pending approval</div>';
  expect(reason()).toBeNull();
});
it('ignores rejection phrases inside unrelated feed posts', () => {
  document.body.innerHTML = '<div role="article">Your post was declined by the group administrators</div>';
  expect(reason()).toBeNull();
});
it('captures posting restriction in a composer', () => {
  document.body.innerHTML = '<div role="dialog">Posting is disabled in this group</div>';
  expect(reason()).toContain('Posting is disabled');
});