import { useCallback, useEffect, useState } from 'react';

export function usePropertySearchHistory(userId: string | undefined, workspaceId: string | null) {
  const key = userId && workspaceId ? `property-search-history:${userId}:${workspaceId}` : null;
  const [entries, setEntries] = useState<string[]>([]);
  useEffect(() => {
    try {
      const saved: unknown = key ? JSON.parse(localStorage.getItem(key) ?? '[]') : [];
      setEntries(Array.isArray(saved) ? saved.filter((entry): entry is string => typeof entry === 'string').slice(0, 20) : []);
    } catch { setEntries([]); }
  }, [key]);
  const remember = useCallback((text: string) => {
    const value = text.trim();
    if (!key || !value) return;
    setEntries(current => {
      const next = [value, ...current.filter(entry => entry !== value)].slice(0, 20);
      try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* Storage unavailable. */ }
      return next;
    });
  }, [key]);
  return { entries, remember };
}