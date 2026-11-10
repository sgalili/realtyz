/** Temporary presentation policy; never replaces authorization or stops server jobs. */
export const INVENTORY_COLLECTION_PHASE = true;
export const INVENTORY_NOTICE_KEY = 'toraff:inventory-notice:v1';
export const INVENTORY_TOOL_EVENT = 'toraff:inventory-tool-coming-soon';
const NETWORK_TOOLS = new Set(['facebook', 'facebook-groups', 'instagram', 'gologin', 'partner-network']);
export function inventoryToolLocked(tool: string): boolean {
  return INVENTORY_COLLECTION_PHASE && NETWORK_TOOLS.has(tool);
}
export function showInventoryComingSoon(tool: string): boolean {
  if (!inventoryToolLocked(tool)) return false;
  window.dispatchEvent(new CustomEvent(INVENTORY_TOOL_EVENT, { detail: tool }));
  return true;
}