import { developerImportPageKind, developerImportUrl } from './yad2DeveloperImport.ts';
import { matchingDevelopers } from './developerIdentity.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validates and retains the exact developer requested by the signed-in project page. */
export function developerImportTarget(body: Record<string, unknown>) {
  const workspace = typeof body.workspace_owner_id === 'string' && UUID.test(body.workspace_owner_id) ? body.workspace_owner_id : '';
  const developerId = typeof body.developer_id === 'string' && UUID.test(body.developer_id) ? body.developer_id : null;
  const sourceUrl = developerImportUrl(typeof body.url === 'string' ? body.url : '');
  const sourceKind = developerImportPageKind(typeof body.url === 'string' ? body.url : '');
  if (!workspace || !sourceUrl || !sourceKind) return null;
  return { workspace, developerId, sourceUrl, sourceKind };
}

export function developerSourceMatches(currentName: string | null | undefined, sourceName: unknown) {
  if (typeof sourceName !== 'string' || !sourceName.trim()) return true;
  return Boolean(currentName && matchingDevelopers([{ company_name: currentName }], sourceName).length);
}

export function developerImportJobRow(target: NonNullable<ReturnType<typeof developerImportTarget>>, requestedBy: string, lease: string) {
  return {
    workspace_owner_id: target.workspace,
    requested_by: requestedBy,
    developer_id: target.developerId,
    source_url: target.sourceUrl,
    stage: target.sourceKind === 'project' ? 'projects' : 'profile',
    lease_token: lease,
    lease_until: new Date(Date.now() + 60_000).toISOString(),
  };
}
