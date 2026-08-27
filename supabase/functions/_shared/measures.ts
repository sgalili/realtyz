// Numeric accuracy for property measurements shared by every edge function.
// Sources sometimes glue the building floor count onto the built area
// ("7124" = 7 floors in the building + 124 m²). Always split them.

export function splitGluedSqm(raw: unknown): { sqm: number | null; floorsInBuilding: number | null } {
  const s = String(raw ?? "").replace(/(\d),(\d{3})(?!\d)/g, "$1$2");
  const tokens = (s.match(/\d+(?:\.\d+)?/g) ?? []).map(Number).filter((n) => Number.isFinite(n));
  if (tokens.length === 0) return { sqm: null, floorsInBuilding: null };
  const plausible = tokens.filter((n) => n >= 8 && n <= 2000);
  if (plausible.length > 0) return { sqm: Math.round(plausible[0]), floorsInBuilding: null };
  const digits = String(Math.trunc(tokens[0]));
  if (digits.length >= 4) {
    const lead = Number(digits.slice(0, digits.length - 3));
    const tail = Number(digits.slice(-3));
    if (tail >= 20 && tail <= 2000 && lead >= 1 && lead <= 60) return { sqm: tail, floorsInBuilding: lead };
  }
  if (digits.length === 3) {
    const tail = Number(digits.slice(1));
    if (tail >= 8 && tail <= 2000) return { sqm: tail, floorsInBuilding: Number(digits[0]) };
  }
  return { sqm: null, floorsInBuilding: null };
}

export const cleanSqm = (raw: unknown): number | null => splitGluedSqm(raw).sqm;
export const floorsInBuildingFromSqm = (raw: unknown): number | null => splitGluedSqm(raw).floorsInBuilding;
