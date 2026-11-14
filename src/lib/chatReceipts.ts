export type DeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed' | 'pending';
export function providerDeliveryStatus(metadata: unknown): DeliveryStatus {
  if (!metadata || typeof metadata !== 'object') return 'sent';
  const status = (metadata as Record<string, unknown>).status;
  if (status === 'read' || status === 'delivered' || status === 'failed') return status;
  if (status === 'pending' || status === 'queued' || status === 'sending') return 'pending';
  return 'sent';
}
export function unreadIncoming(incoming: boolean, read: boolean | null | undefined) {
  return incoming && read !== true;
}