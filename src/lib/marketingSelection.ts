export function selectedMarketingCards<T extends { id: string }>(cards: T[], selected: ReadonlySet<string>, selecting: boolean): T[] {
  return selecting ? cards.filter(card => selected.has(card.id)) : [];
}