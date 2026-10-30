import { expect, it } from 'vitest';
import { PERSONAL_TASK_TYPES, personalTaskMatches, type PersonalTask } from './personalTasks';
const task: PersonalTask = { id: 't', title: 'test', content: '', scheduled_for: '2026-10-30T14:00:00', status: 'pending', item_type: 'task', metadata: {} };
it('personal tasks exclude tours and keep task, reminder and follow-up types', () => {
  expect(PERSONAL_TASK_TYPES).toEqual(['task', 'reminder', 'follow_up']);
});
it('today includes only tasks scheduled on the selected current date', () => {
  expect(personalTaskMatches(task, 'today', new Date('2026-10-30T09:00:00'))).toBe(true);
  expect(personalTaskMatches(task, 'today', new Date('2026-10-31T09:00:00'))).toBe(false);
});
it('completed tasks move out of active tasks and into completed', () => {
  const done = { ...task, status: 'completed' };
  expect(personalTaskMatches(done, 'active')).toBe(false);
  expect(personalTaskMatches(done, 'completed')).toBe(true);
  expect(personalTaskMatches(task, 'completed')).toBe(false);
});
it('follow-up tab matches only unfinished follow-up records', () => {
  expect(personalTaskMatches(task, 'follow_up')).toBe(false);
  expect(personalTaskMatches({ ...task, item_type: 'follow_up' }, 'follow_up')).toBe(true);
  expect(personalTaskMatches({ ...task, item_type: 'follow_up', status: 'completed' }, 'follow_up')).toBe(false);
});