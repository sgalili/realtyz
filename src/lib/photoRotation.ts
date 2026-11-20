export type PhotoRotationScope =
  | { type: 'workspace'; workspaceOwnerId: string; label: string }
  | { type: 'listing'; listingId: string; label: string }
  | { type: 'project-unit'; projectId: string; unitId: string; buildingId?: string | null; label: string };

export type PhotoRotationResult = { listings: number; projects: number; apartments: number; total: number };

export const canRotateFirstTwoPhotos = (isSuperAdmin: boolean, isDemoMode: boolean) => isSuperAdmin && !isDemoMode;

export function rotateFirstTwo<T>(items: T[]): T[] {
  return items.length > 2 ? [...items.slice(2), ...items.slice(0, 2)] : [...items];
}

export function photoRotationRpcArgs(scope: PhotoRotationScope) {
  if (scope.type === 'workspace') return { _scope: 'workspace' as const, _workspace_owner_id: scope.workspaceOwnerId };
  if (scope.type === 'listing') return { _scope: 'listing' as const, _listing_id: scope.listingId };
  return { _scope: 'project_unit' as const, _project_id: scope.projectId, _unit_id: scope.unitId, _building_id: scope.buildingId ?? null };
}

export function photoRotationConfirmation(scope: PhotoRotationScope) {
  const target = scope.type === 'workspace'
    ? `כל הנכסים, הפרויקטים והדירות של ${scope.label}`
    : scope.type === 'listing' ? `נכס ${scope.label}` : `דירה ${scope.label}`;
  return `להעביר את שתי התמונות הראשונות לסוף ב${target}? יעודכנו רק פריטים שבהם יש יותר משתי תמונות.`;
}

export function photoRotationSummary(result: PhotoRotationResult) {
  if (!result.total) return 'לא נמצאו פריטים עם יותר משתי תמונות בטווח שנבחר';
  const parts = [
    result.listings ? `${result.listings} נכסים` : '',
    result.projects ? `${result.projects} פרויקטים` : '',
    result.apartments ? `${result.apartments} דירות` : '',
  ].filter(Boolean);
  return `עודכנו ${result.total} פריטים: ${parts.join(' · ')}`;
}
