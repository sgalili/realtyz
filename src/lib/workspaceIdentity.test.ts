import { describe, expect, it } from 'vitest';
import { resolveWorkspaceIdentity } from './workspaceIdentity';
import type { Workspace } from '@/hooks/useWorkspace';

describe('workspace identity privacy', () => {
  it('never surfaces an internal login alias cached as office branding', () => {
    const workspace = { is_self: true, workspace_name: 'p972537759408@phone.toraff.invalid' } as Workspace;
    expect(resolveWorkspaceIdentity(workspace, { agency_name: 'p972537759408@phone.toraff.invalid' }).name).toBe('TORAF');
  });
});