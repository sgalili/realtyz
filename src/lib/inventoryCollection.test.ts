import { describe, expect, it, vi } from 'vitest';
import { inventoryToolLocked, showInventoryComingSoon, INVENTORY_TOOL_EVENT } from './inventoryCollection';

describe('inventory collection phase', () => {
  it.each(['facebook', 'facebook-groups', 'instagram', 'gologin', 'partner-network'])('soft-locks %s before network launch', tool => {
    expect(inventoryToolLocked(tool)).toBe(true);
  });
  it.each(['yad2', 'homely', 'properties', 'drafts', 'public-publication', 'email', 'whatsapp'])('keeps %s available for inventory workflows', tool => {
    expect(inventoryToolLocked(tool)).toBe(false);
  });
  it('announces preparation without invoking an external action', () => {
    const listener = vi.fn();
    window.addEventListener(INVENTORY_TOOL_EVENT, listener);
    expect(showInventoryComingSoon('facebook')).toBe(true);
    expect(listener).toHaveBeenCalledOnce();
    expect(showInventoryComingSoon('yad2')).toBe(false);
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener(INVENTORY_TOOL_EVENT, listener);
  });
});