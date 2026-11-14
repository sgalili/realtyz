import { expect, it } from 'vitest';
import { providerDeliveryStatus, unreadIncoming } from './chatReceipts';
it('uses one tick until delivery evidence exists', () => { expect(providerDeliveryStatus(null)).toBe('sent'); expect(providerDeliveryStatus({ status: 'sent' })).toBe('sent'); });
it('uses two gray ticks only for delivered', () => { expect(providerDeliveryStatus({ status: 'delivered' })).toBe('delivered'); });
it('uses two blue ticks only for actual read confirmation', () => { expect(providerDeliveryStatus({ status: 'read' })).toBe('read'); expect(providerDeliveryStatus({ reply_received: true })).toBe('sent'); });
it('bolds unread incoming messages only', () => { expect(unreadIncoming(true, false)).toBe(true); expect(unreadIncoming(true, true)).toBe(false); expect(unreadIncoming(false, false)).toBe(false); });