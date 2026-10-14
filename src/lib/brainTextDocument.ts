/** Derive a file name from text without a separate title field. */
export function brainTextDocumentName(text: string): string {
  const summary = text.trim().split(/\r?\n/)[0].replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 70);
  return `${summary || 'הנחיות'}.txt`;
}
