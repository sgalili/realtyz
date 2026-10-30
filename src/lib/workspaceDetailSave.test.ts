import { describe, expect, it } from 'vitest';
import { workspaceDetailPatch } from './workspaceDetailSave';

describe('inline office saving', () => {
  it('saves only the confirmed display name', () => {
    expect(workspaceDetailPatch('owner-a', 'agency_name', ' משרד א ')).toEqual({ user_id: 'owner-a', agency_name: 'משרד א' });
  });
  it('logo auto-save cannot overwrite a display-name draft or the legacy logo', () => {
    expect(workspaceDetailPatch('owner-b', 'logo_url', '/square.png')).toEqual({ user_id: 'owner-b', logo_url: '/square.png' });
  });
  it('logo removal clears only the active owner square logo', () => {
    expect(workspaceDetailPatch('owner-b', 'logo_url', '')).toEqual({ user_id: 'owner-b', logo_url: null });
  });
});