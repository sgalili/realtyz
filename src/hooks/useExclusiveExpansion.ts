import { useCallback, useEffect, useId, useSyncExternalStore } from 'react';

// Each peer group shares one active key; nested controls belong to another group.
const active = new Map<string, string>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function useExclusiveExpansion(group: string, key?: string) {
  const generated = useId();
  const id = key ?? generated;
  const open = useSyncExternalStore(subscribe, () => active.get(group) === id, () => false);
  const setOpen = useCallback((next: boolean | ((previous: boolean) => boolean)) => {
    const previous = active.get(group) === id;
    const value = typeof next === 'function' ? next(previous) : next;
    if (value === previous) return;
    if (value) active.set(group, id); else if (previous) active.delete(group);
    listeners.forEach((listener) => listener());
  }, [group, id]);
  useEffect(() => () => {
    if (active.get(group) === id) { active.delete(group); listeners.forEach((listener) => listener()); }
  }, [group, id]);
  return [open, setOpen] as const;
}