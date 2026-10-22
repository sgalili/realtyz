export const postNetwork = (channel: string | null | undefined) => {
  const key = String(channel ?? '').toLowerCase();
  return key === 'twitter' ? 'x' : key;
};
export function postNetworkCounts(rows: { channel?: string | null }[]) {
  return rows.reduce<Record<string, number>>((counts, row) => {
    const key = postNetwork(row.channel);
    if (key) counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}
export function togglePostNetwork(disabled: string[], network: string, available: string[]) {
  if (!available.includes(network)) return disabled;
  if (disabled.includes(network)) return disabled.filter((key) => key !== network);
  if (available.filter((key) => !disabled.includes(key)).length <= 1) return disabled;
  return [...disabled, network];
}