export function brokerInventoryChoices(roles: readonly string[], verified: boolean, readyCount: number) {
  return verified && roles.some(role => ['agent', 'lead_agent', 'managing_broker'].includes(role)) && readyCount > 0;
}