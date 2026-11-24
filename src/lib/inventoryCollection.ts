/** Temporary presentation policy; never replaces authorization or stops server jobs. */
export const INVENTORY_COLLECTION_PHASE = true;
export const INVENTORY_NOTICE_KEY = 'toraff:inventory-notice:v1';
export const INVENTORY_TOOL_EVENT = 'toraff:inventory-tool-coming-soon';
const NETWORK_TOOLS = new Set(['facebook', 'facebook-groups', 'instagram', 'gologin', 'partner-network']);
/** Broker publishing tools open in brokers-only mode; only the partner network stays closed. */
const BROKERS_ONLY_LOCKED = new Set(['partner-network']);

// Brokers-only is the platform default until the public setting loads.
let brokersOnlyMode = true;
export function setInventoryBrokersOnly(value: boolean) { brokersOnlyMode = value; }
export function inventoryBrokersOnly() { return brokersOnlyMode; }

export function inventoryToolLocked(tool: string): boolean {
  if (!INVENTORY_COLLECTION_PHASE) return false;
  return brokersOnlyMode ? BROKERS_ONLY_LOCKED.has(tool) : NETWORK_TOOLS.has(tool);
}
export function showInventoryComingSoon(tool: string): boolean {
  if (!inventoryToolLocked(tool)) return false;
  window.dispatchEvent(new CustomEvent(INVENTORY_TOOL_EVENT, { detail: tool }));
  return true;
}
