export const BROKER_REGISTRY_DATASET = 'd361f6a6-898c-4e4d-8a80-abc4e8643bf6';
export const BROKER_REGISTRY_RESOURCE = 'a0f56034-88db-4132-8803-854bcdb01ca1';
export const BROKER_REGISTRY_SOURCE = `https://data.gov.il/dataset/${BROKER_REGISTRY_DATASET}`;
export const BROKER_LICENSE_PATTERN = /^[1-9][0-9]{0,9}$/;
export const INVALID_BROKER_LICENSE = 'מספר הרישיון אינו תקף או אינו מופיע בפנקס המתווכים המורשים';
export const BROKER_REGISTRY_UNAVAILABLE = 'לא ניתן לאמת את הרישיון מול פנקס המתווכים כרגע. נסו שוב מאוחר יותר.';

export function exactRegistryRecord(records: unknown[], license: string) {
  return records.find((row): row is Record<string, unknown> => {
    if (!row || typeof row !== 'object') return false;
    const record = row as Record<string, unknown>;
    return String(record['מס רשיון']) === license && typeof record['שם המתווך'] === 'string' && record['שם המתווך'].trim().length > 0;
  });
}

export function registrySourceIsFresh(updatedAt: string, now = new Date()) {
  const updated = new Date(updatedAt);
  const age = now.getTime() - updated.getTime();
  return Number.isFinite(age) && age >= -60_000 && age <= 7 * 24 * 60 * 60 * 1000 && updated.getUTCFullYear() === now.getUTCFullYear();
}