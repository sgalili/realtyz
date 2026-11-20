import { describe, expect, it } from 'vitest';
import { canRotateFirstTwoPhotos, photoRotationConfirmation, photoRotationRpcArgs, photoRotationSummary, rotateFirstTwo } from './photoRotation';

describe('scoped first-two photo rotation', () => {
  it('moves exactly indexes 0 and 1 to the end while preserving order', () => {
    expect(rotateFirstTwo(['a', 'b', 'c', 'd', 'e'])).toEqual(['c', 'd', 'e', 'a', 'b']);
  });
  it('does not change items with two photos or fewer', () => {
    expect(rotateFirstTwo(['a', 'b'])).toEqual(['a', 'b']);
    expect(rotateFirstTwo(['a'])).toEqual(['a']);
  });
  it('allows only a non-demo Super Admin', () => {
    expect(canRotateFirstTwoPhotos(true, false)).toBe(true);
    expect(canRotateFirstTwoPhotos(true, true)).toBe(false);
    expect(canRotateFirstTwoPhotos(false, false)).toBe(false);
  });
  it('scopes a workspace action to one broker or developer only', () => {
    expect(photoRotationRpcArgs({ type: 'workspace', workspaceOwnerId: 'owner-1', label: 'יזם א' })).toEqual({ _scope: 'workspace', _workspace_owner_id: 'owner-1' });
  });
  it('scopes a single listing without accepting a workspace substitute', () => {
    expect(photoRotationRpcArgs({ type: 'listing', listingId: 'listing-1', label: 'נכס א' })).toEqual({ _scope: 'listing', _listing_id: 'listing-1' });
  });
  it('scopes one apartment by project, unit and building identity', () => {
    expect(photoRotationRpcArgs({ type: 'project-unit', projectId: 'project-1', unitId: 'unit-1', buildingId: 'building-1', label: 'דירה א' })).toEqual({ _scope: 'project_unit', _project_id: 'project-1', _unit_id: 'unit-1', _building_id: 'building-1' });
  });
  it('explains the exact selected scope before confirmation', () => {
    expect(photoRotationConfirmation({ type: 'workspace', workspaceOwnerId: 'owner-1', label: 'יזם א' })).toContain('של יזם א');
    expect(photoRotationConfirmation({ type: 'listing', listingId: 'listing-1', label: 'רוטשילד 1' })).toContain('בנכס רוטשילד 1');
  });
  it('reports exact per-type counts and a truthful zero result', () => {
    expect(photoRotationSummary({ listings: 2, projects: 1, apartments: 3, total: 6 })).toBe('עודכנו 6 פריטים: 2 נכסים · 1 פרויקטים · 3 דירות');
    expect(photoRotationSummary({ listings: 0, projects: 0, apartments: 0, total: 0 })).toContain('לא נמצאו');
  });
});
