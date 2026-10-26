import { expect, it } from 'vitest';
import { deletePostImage } from './postImageDeletion';

it('closes both dialogs after confirmed deletion instead of opening another image', () => {
  const result = deletePostImage([{ url: 'first.jpg' }, { url: 'second.jpg' }], [], 'first.jpg');
  expect(result.attachments).toEqual([{ url: 'second.jpg' }]);
  expect(result.previewImageUrl).toBeNull();
  expect(result.pendingImageDelete).toBeNull();
});

it('remembers deletion only in the post and leaves the source property gallery intact', () => {
  const gallery = [{ url: 'first.jpg' }, { url: 'second.jpg' }];
  const result = deletePostImage(gallery, [], 'first.jpg');
  expect(gallery).toEqual([{ url: 'first.jpg' }, { url: 'second.jpg' }]);
  expect(result.removedUrls).toEqual(['first.jpg']);
  expect(deletePostImage(result.attachments, result.removedUrls, 'first.jpg').removedUrls).toEqual(['first.jpg']);
});