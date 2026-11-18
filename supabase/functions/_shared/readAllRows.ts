/** Read every saved row; API response limits must never become inventory totals. */
export async function readAllRows<T>(load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await load(from, from + 499);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 500) return rows;
  }
}