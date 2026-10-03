import { describe, expect, it } from 'vitest';
import { mediaSourceIdentity, resolveMediaUrls } from './postMediaUrl';

describe('post media source identity', () => {
  const original = 'https://cdn.example.com/photos/room.jpg?signature=old';
  const mirror = `https://storage.example.com/storage/v1/object/public/post-media-cache/posts/${mediaSourceIdentity(original)}.jpg`;
  it('matches a cached copy to its original source', () => {
    expect(mediaSourceIdentity(mirror)).toBe(mediaSourceIdentity(original));
    expect(resolveMediaUrls([mirror, original, original.replace('old', 'new'), mirror])).toEqual([mirror]);
  });
  it('preserves distinct images and original order', () => {
    const another = 'https://cdn.example.com/other/room.jpg';
    expect(resolveMediaUrls([original, another, original])).toEqual([original, another]);
  });
  it('supports object-shaped media without creating additional copies', () => {
    expect(resolveMediaUrls([{ url: mirror }, { src: original }, mirror])).toEqual([mirror]);
  });
});