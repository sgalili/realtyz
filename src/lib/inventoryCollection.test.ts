import { afterEach, describe, expect, it, vi } from 'vitest';
import { inventoryToolLocked, setInventoryBrokersOnly, showInventoryComingSoon, INVENTORY_TOOL_EVENT } from './inventoryCollection';

afterEach(() => setInventoryBrokersOnly(true));

describe('inventory collection phase', () => {
  it.each(['facebook', 'facebook-groups', 'instagram', 'gologin'])('opens %s for brokers in brokers-only mode', tool => {
    setInventoryBrokersOnly(true);
    expect(inventoryToolLocked(tool)).toBe(false);
  });
  it('keeps the partner network closed in brokers-only mode', () => {
    setInventoryBrokersOnly(true);
    expect(inventoryToolLocked('partner-network')).toBe(true);
  });
  it.each(['facebook', 'facebook-groups', 'instagram', 'gologin', 'partner-network'])('soft-locks %s in the full marketplace before network launch', tool => {
    setInventoryBrokersOnly(false);
    expect(inventoryToolLocked(tool)).toBe(true);
  });
  it.each(['yad2', 'homely', 'properties', 'drafts', 'public-publication', 'email', 'whatsapp'])('keeps %s available for inventory workflows', tool => {
    setInventoryBrokersOnly(false);
    expect(inventoryToolLocked(tool)).toBe(false);
  });
  it('announces preparation without invoking an external action', () => {
    setInventoryBrokersOnly(false);
    const listener = vi.fn();
    window.addEventListener(INVENTORY_TOOL_EVENT, listener);
    expect(showInventoryComingSoon('facebook')).toBe(true);
    expect(listener).toHaveBeenCalledOnce();
    expect(showInventoryComingSoon('yad2')).toBe(false);
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener(INVENTORY_TOOL_EVENT, listener);
  });
});
