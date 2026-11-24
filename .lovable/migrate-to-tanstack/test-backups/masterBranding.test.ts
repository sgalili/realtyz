import { describe, expect, it } from 'vitest';
import { resolveWorkspaceIdentity } from '@/lib/workspaceIdentity';
import type { Workspace } from '@/hooks/useWorkspace';

const master = { agency_name: 'TORAF', logo_url: 'https://office.example/master.png' };
const workspace: Workspace = { workspace_owner_id: 'tenant', user_id: 'member', role: 'agent', workspace_name: 'משרד פרטי', workspace_logo_url: null, account_type: 'agency', last_accessed_at: null, owner_full_name: 'Owner', owner_email: null, owner_avatar_url: 'https://office.example/avatars/personal.jpg', is_self: false };

describe('master office inheritance', () => {
  it('defaults the public identity to TORAF', () => {
    expect(resolveWorkspaceIdentity(null, null, master)).toEqual({ name: 'TORAF', logo: master.logo_url, isTenant: false });
  });
  it('inherits the office logo without changing another office name', () => {
    expect(resolveWorkspaceIdentity(workspace, null, master)).toEqual({ name: 'משרד פרטי', logo: master.logo_url, isTenant: true });
  });
  it('keeps a custom-uploaded tenant logo', () => {
    expect(resolveWorkspaceIdentity(workspace, { logo_url: 'https://office.example/custom.png' }, master).logo).toBe('https://office.example/custom.png');
  });
  it('rejects a personal avatar as an office logo and never mutates it', () => {
    const result = resolveWorkspaceIdentity(workspace, { logo_url: workspace.owner_avatar_url }, master);
    expect(result.logo).toBe(master.logo_url);
    expect(workspace.owner_avatar_url).toBe('https://office.example/avatars/personal.jpg');
  });
  it('uses the latest saved office name over a stale workspace-list label', () => {
    expect(resolveWorkspaceIdentity(workspace, { agency_name: 'New office' }, master).name).toBe('New office');
  });
});