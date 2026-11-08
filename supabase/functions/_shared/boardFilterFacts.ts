/** Explicit public property-fact whitelist: never forward imported metadata or contact/financial fields. */
export function boardFilterFacts(row: Record<string, any>) {
  const features = row.features ?? {};
  const bags = [row, features, features.source_details ?? {}, row.additional_details ?? {}, row.attributes ?? {}];
  const read = (...keys: string[]) => {
    for (const bag of bags) for (const key of keys) if (bag[key] != null && bag[key] !== '') return bag[key];
    return undefined;
  };
  const propertyType = read('property_type', 'propertyType') ?? row.additional_details?.text ?? row.attributes?.text;
  const facts: Record<string, unknown> = {};
  const aliases: Record<string, string[]> = {
    elevator_count: ['elevator_count', 'elevatorCount', 'elevator', 'includeElevator'],
    parking_count: ['parking_count', 'parkingCount', 'parkingSpacesCount', 'parking_spots', 'parking', 'includeParking'],
    balcony_types: ['balcony_types', 'balconyTypes'], balcony: ['balcony', 'includeBalcony'],
    view_type: ['view_type', 'viewType'], open_view: ['open_view', 'openView'],
    air_directions: ['air_directions', 'airDirections'], condition: ['condition', 'propertyCondition'],
    total_floors: ['total_floors', 'totalFloors', 'buildingTopFloor'],
    safe_room: ['safe_room', 'shelter', 'includeSecurityRoom'], shelter: ['includeFloorShelter', 'includeBuildingShelter'],
    storage: ['storage', 'warehouse', 'includeWarehouse'], ac: ['ac', 'air_conditioning', 'includeAirconditioner', 'includeTornado'],
    solar: ['solar', 'solar_heater', 'includeBoiler'], furnished: ['furnished', 'includeFurniture'],
    bars: ['bars', 'includeBars'], includeRavBariach: ['includeRavBariach'], accessible: ['accessible', 'isHandicapped'],
    renovated: ['renovated', 'isRenovated'], kosher_kitchen: ['kosher_kitchen', 'isKitchenKosher'],
    pets_allowed: ['pets', 'pets_allowed', 'isPetsAllowed'], garden: ['garden', 'yard', 'garden_sqm', 'squareMeterGarden'],
    isPillarBuilding: ['isPillarBuilding'], isAssetExclusive: ['isAssetExclusive'],
  };
  for (const [key, names] of Object.entries(aliases)) {
    const value = read(...names);
    if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') facts[key] = value;
    else if (Array.isArray(value)) facts[key] = value.filter(item => typeof item === 'string');
  }
  const entry = read('entry_date', 'entryDate', 'available_from', 'entranceDate');
  if (read('isImmediateEntrance') === true) facts.entry_date = 'מיידית';
  else if (typeof entry === 'string') facts.entry_date = entry.includes('T') ? entry.split('T')[0] : entry;
  if (Array.isArray(features.amenity_labels)) facts.amenity_labels = features.amenity_labels.filter((item: unknown) => typeof item === 'string');
  return { property_type: typeof propertyType === 'string' ? propertyType : null, features: facts, total_floors: facts.total_floors ?? null };
}