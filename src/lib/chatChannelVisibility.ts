export function channelVisible(channel: string | null | undefined, disabled: ReadonlySet<string>): boolean {
  return !disabled.has(String(channel ?? '').toLowerCase());
}