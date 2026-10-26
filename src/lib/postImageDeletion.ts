/** Post-local deletion: never mutate a source gallery or delete a stored file. */
export function deletePostImage<T extends { url?: string }>(attachments: T[], removedUrls: string[], url: string) {
  return {
    attachments: attachments.filter(item => item.url !== url),
    removedUrls: [...new Set([...removedUrls, url])],
    previewImageUrl: null,
    pendingImageDelete: null,
  };
}