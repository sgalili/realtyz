import { resolveAdminSection, type AdminSection } from './superAdminSections';

const STORAGE_KEY = 'toraff-super-admin-view';
export type AdminHistoryTab = 'imports' | 'sends';
export type SuperAdminViewState = {
  section?: AdminSection;
  history?: AdminHistoryTab;
  openSendKey?: string | null;
};

export function readSuperAdminViewState(): SuperAdminViewState {
  try {
    const value = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '{}') as SuperAdminViewState;
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

export function saveSuperAdminViewState(patch: SuperAdminViewState) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readSuperAdminViewState(), ...patch }));
  } catch {
    // State restoration is optional when storage is unavailable.
  }
}

export function adminSectionFromParams(value: string | null): AdminSection {
  return resolveAdminSection(value ?? readSuperAdminViewState().section ?? null);
}

export function adminHistoryFromParams(value: string | null): AdminHistoryTab {
  if (value === 'imports' || value === 'sends') return value;
  return readSuperAdminViewState().history === 'sends' ? 'sends' : 'imports';
}
