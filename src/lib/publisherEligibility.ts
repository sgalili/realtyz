export function brokerInventoryChoices(roles: readonly string[], verified: boolean, readyCount: number) {
  return verified && roles.some(role => ['agent', 'lead_agent', 'managing_broker'].includes(role)) && readyCount > 0;
}

/** Draft content survives reopening, but navigation never skips publisher selection. */
export function publisherEntryNavigation() {
  return { step: 0, rolePicked: false, reviewMode: false, importSlide: false, expandedStep: '' };
}

export function publisherRequiresOwnership(publisherType: string, pricingOnly = false) {
  return !pricingOnly && publisherType === 'private';
}