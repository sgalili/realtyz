/** Neutralizes spreadsheet formula injection (=, +, -, @, tab, CR) in exported cell text. */
export function safeCell(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

export function safeRows<T extends Record<string, unknown>>(rows: T[]): T[] {
  return rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, safeCell(v)])) as T);
}
