export type SourceRecord = Record<string, unknown>;
export const sourceRecord = (value: unknown): SourceRecord => value && typeof value === 'object' && !Array.isArray(value) ? value as SourceRecord : {};
const string = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : null;
const first = (row: SourceRecord, keys: string[]) => keys.map(key => row[key]).find(value => value != null && value !== '');
const numeric = (value: unknown) => { const raw = string(value); if (raw == null || !raw.trim()) return null; const number = Number(raw.replace(/[,₪\s]/g, '')); return Number.isFinite(number) ? number : null; };
export type ProjectUnit = SourceRecord & { source_unit_id: string; building_id: string | null; building_name: string | null; rooms: number | null; floor: string | null; size_sqm: number | null; price: number | null; images: string[] };
export type ProjectBuilding = SourceRecord & { source_building_id: string; name: string | null; units: ProjectUnit[] };
const buildingKeys = /^(buildings|building|towers|tower|blocks|block)$/i;
const unitKeys = /^(apartments|apartment|units|unit|unitTypes|apartmentTypes|models|properties)$/i;
const ignoredKeys = /^(related|recommendations|similar|source_details|source_snapshots|hierarchy)$/i;
function images(value: unknown): string[] {
  const out = new Set<string>();
  const walk = (v: unknown, context = false, depth = 0) => {
    if (depth > 20) return;
    if (typeof v === 'string' && context && /^https:\/\//i.test(v)) out.add(v);
    else if (Array.isArray(v)) v.forEach(item => walk(item, context, depth + 1));
    else if (v && typeof v === 'object') Object.entries(v).forEach(([key, item]) => { if (!ignoredKeys.test(key)) walk(item, /image|photo|gallery|thumbnail|cover/i.test(key) || (context && /url|src/i.test(key)), depth + 1); });
  };
  walk(value); return [...out];
}
export function mergeSource(old: unknown, fresh: unknown): unknown {
  if (fresh == null || fresh === '') return old ?? fresh;
  if (Array.isArray(fresh)) {
    const previous = Array.isArray(old) ? old : [];
    const result = [...previous];
    for (const value of fresh) {
      const row = sourceRecord(value);
      const identity = first(row, ['source_building_id', 'source_unit_id', 'buildingId', 'apartmentId', 'unitId', 'id', 'token']);
      const index = result.findIndex(item => identity != null ? first(sourceRecord(item), ['source_building_id', 'source_unit_id', 'buildingId', 'apartmentId', 'unitId', 'id', 'token']) === identity && (sourceRecord(item).building_id ?? null) === (row.building_id ?? null) : JSON.stringify(item) === JSON.stringify(value));
      if (index < 0) result.push(value); else result[index] = mergeSource(result[index], value);
    }
    return result;
  }
  if (typeof fresh === 'object') {
    const result = { ...sourceRecord(old) };
    Object.entries(sourceRecord(fresh)).forEach(([key, value]) => { result[key] = mergeSource(result[key], value); });
    return result;
  }
  return fresh;
}
/** Read only the current project's hierarchy, preserving raw source specs and parent identity. */
export function extractProjectHierarchy(source: unknown): { buildings: ProjectBuilding[]; apartments: ProjectUnit[] } {
  const buildings = new Map<string, ProjectBuilding>();
  const apartments = new Map<string, ProjectUnit>();
  const walk = (value: unknown, context = '', parent: ProjectBuilding | null = null, path = 'project', depth = 0) => {
    if (depth > 30) return;
    if (Array.isArray(value)) { value.forEach((item, index) => walk(item, context, parent, `${path}.${index}`, depth + 1)); return; }
    if (!value || typeof value !== 'object') return;
    const row = sourceRecord(value);
    let building = parent;
    if (buildingKeys.test(context)) {
      const id = string(first(row, ['source_building_id', 'buildingId', 'towerId', 'id', 'token'])) ?? path;
      building = { ...row, source_building_id: id, name: string(first(row, ['buildingName', 'towerName', 'name', 'title', 'number'])), units: [] };
      buildings.set(id, building);
    }
    const isUnit = unitKeys.test(context) || ((row.rooms != null || row.roomsCount != null) && ['price', 'floor', 'floorNumber', 'squareMeter', 'squareMeters', 'area', 'size', 'size_sqm'].some(key => row[key] != null));
    if (isUnit && !buildingKeys.test(context)) {
      const id = string(first(row, ['source_unit_id', 'apartmentId', 'unitId', 'id', 'token'])) ?? path;
      const buildingId = string(first(row, ['building_id', 'buildingId', 'towerId'])) ?? building?.source_building_id ?? null;
      const unit: ProjectUnit = { ...row, source_unit_id: id, building_id: buildingId, building_name: string(row.building_name) ?? building?.name ?? null,
        rooms: numeric(first(row, ['rooms', 'roomsCount', 'numberOfRooms'])), floor: string(first(row, ['floor', 'floorNumber'])), size_sqm: numeric(first(row, ['size_sqm', 'squareMeter', 'squareMeters', 'area', 'size'])), price: numeric(first(row, ['price', 'priceFrom', 'askingPrice'])),
        balcony_sqm: numeric(first(row, ['balcony_sqm', 'balconyArea', 'balconySize'])), count: numeric(first(row, ['count', 'availableUnits', 'unitsCount'])), type: string(first(row, ['propertyType', 'assetType', 'type'])), images: images(row), source_details: row.source_details ?? row };
      const key = `${buildingId ?? ''}:${id}`;
      apartments.set(key, mergeSource(apartments.get(key), unit) as ProjectUnit);
    }
    Object.entries(row).forEach(([key, item]) => { if (!ignoredKeys.test(key) && key !== 'images') walk(item, key, building, `${path}.${key}`, depth + 1); });
  };
  walk(source);
  for (const unit of apartments.values()) {
    if (!unit.building_id) continue;
    if (!buildings.has(unit.building_id)) buildings.set(unit.building_id, { source_building_id: unit.building_id, name: unit.building_name, units: [] });
    buildings.get(unit.building_id)?.units.push(unit);
  }
  return { buildings: [...buildings.values()], apartments: [...apartments.values()] };
}
/** Persisted apartment edits take precedence over original source unit values. */
export function savedProjectHierarchy(project: { apartments?: unknown; source_details?: unknown }) {
  const details = sourceRecord(project.source_details);
  const hierarchy = sourceRecord(details.hierarchy);
  const original = extractProjectHierarchy(Object.keys(hierarchy).length ? hierarchy : details);
  const edited = extractProjectHierarchy({ apartments: project.apartments ?? [] });
  const units = new Map(original.apartments.map(unit => [`${unit.building_id ?? ''}:${unit.source_unit_id}`, unit]));
  edited.apartments.forEach(unit => units.set(`${unit.building_id ?? ''}:${unit.source_unit_id}`, mergeSource(units.get(`${unit.building_id ?? ''}:${unit.source_unit_id}`), unit) as ProjectUnit));
  const grouped: ProjectBuilding[] = original.buildings.map(building => ({ ...building, units: [...units.values()].filter(unit => unit.building_id === building.source_building_id) }));
  [...units.values()].forEach(unit => { if (unit.building_id && !grouped.some(building => building.source_building_id === unit.building_id)) grouped.push({ source_building_id: unit.building_id, name: unit.building_name, units: [...units.values()].filter(item => item.building_id === unit.building_id) }); });
  return { buildings: grouped, apartments: [...units.values()], unassigned: [...units.values()].filter(unit => !unit.building_id) };
}