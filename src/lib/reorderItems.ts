export function reorderItems<T>(items: T[], from: number, to: number): T[] {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= items.length || to >= items.length || from === to) return items;
  const next = [...items];
  const moved = next.splice(from, 1)[0];
  next.splice(to, 0, moved);
  return next;
}