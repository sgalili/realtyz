export const PERSONAL_TASK_TYPES = ['task', 'reminder', 'follow_up'];
export type PersonalTaskTab = 'active' | 'today' | 'follow_up' | 'completed';
export type PersonalTask = {
  id: string; title: string; content: string; scheduled_for: string; status: string;
  item_type: string; metadata: unknown;
};
export function personalTaskMatches(task: PersonalTask, tab: PersonalTaskTab, now = new Date()) {
  const completed = ['completed', 'done', 'sent', 'archived', 'cancelled'].includes(task.status);
  if (tab === 'completed') return completed;
  if (completed) return false;
  if (tab === 'follow_up') return task.item_type === 'follow_up';
  if (tab === 'today') return new Date(task.scheduled_for).toDateString() === now.toDateString();
  return true;
}