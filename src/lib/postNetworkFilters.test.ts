import { describe, expect, it } from 'vitest';
import { postNetworkCounts, togglePostNetwork } from './postNetworkFilters';
describe('post network filtering', () => {
  it('starts with every published network active and counts aliases together', () => {
    expect(postNetworkCounts([{ channel: 'facebook' }, { channel: 'twitter' }, { channel: 'x' }])).toEqual({ facebook: 1, x: 2 });
  });
  it('disables a network and re-enables it', () => {
    expect(togglePostNetwork([], 'facebook', ['facebook', 'x'])).toEqual(['facebook']);
    expect(togglePostNetwork(['facebook'], 'facebook', ['facebook', 'x'])).toEqual([]);
  });
  it('cannot disable the last active network', () => {
    expect(togglePostNetwork(['facebook'], 'x', ['facebook', 'x'])).toEqual(['facebook']);
    expect(togglePostNetwork([], 'facebook', ['facebook'])).toEqual([]);
  });
});