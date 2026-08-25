/**
 * The AI leg occasionally leaks its raw envelope into the message body:
 * fenced code blocks (```json ... ```), a bare JSON object with a `reply` /
 * `message` field, or escaped characters (`\n`, `\"`) that were never
 * unescaped. This normalizes any of those into clean, human-readable text
 * before the chat bubble renders it.
 */
export function sanitizeChatText(raw: string | null | undefined): string {
  if (!raw) return '';
  let text = String(raw).trim();

  // 1) Drop the dispatcher's channel tag ("[whatsapp] ...") before anything else.
  text = text.replace(/^\s*\[(?:whatsapp|instagram|facebook|messenger|email|sms|telegram|web)\]\s*/i, '');

  // 2) Strip markdown code fences, keeping their inner content.
  text = text.replace(/```[a-zA-Z]*\s*([\s\S]*?)```/g, '$1').trim();
  // Orphan fence / language token left by a truncated stream.
  text = text.replace(/^```[a-zA-Z]*\s*/i, '').replace(/```$/, '').trim();
  text = text.replace(/^json\s*[\r\n]+/i, '').trim();

  // 3) If the payload is a JSON wrapper, pull the human text out of it FIRST —
  //    unescaping before parsing would corrupt the JSON.
  if (text.startsWith('{') || text.startsWith('[')) {
    const extracted = extractFromJson(text);
    if (extracted) text = extracted;
  } else {
    // Trailing/leading JSON blob glued to real prose.
    const blob = text.match(/\{[\s\S]*"(?:reply|message|text|content|answer|response)"[\s\S]*\}/);
    if (blob) {
      const extracted = extractFromJson(blob[0]);
      if (extracted) {
        const rest = text.replace(blob[0], '').trim();
        text = [rest, extracted].filter(Boolean).join('\n');
      }
    }
  }

  // 4) Unescape any escape sequences that survived as literal text.
  if (/\\n|\\"|\\t/.test(text)) {
    text = text
      .replace(/\\r\\n|\\n|\\r/g, '\n')
      .replace(/\\t/g, '  ')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, '\\');
  }

  // 5) Drop internal debug artefacts that mean nothing to a human: the short
  //    listing-id tokens the agent emits ("[1fa196ce] הרצליה ...") and the
  //    empty emphasis pairs they leave behind.
  text = text.replace(/\[[0-9a-f]{6,8}\]\s*/gi, '');
  text = text.replace(/\((?:id|listing|נכס)\s*[:=]?\s*[0-9a-f-]{6,36}\)/gi, '');
  text = text.replace(/(\*\*|__|\*|_)\s*\1/g, '');


  // 5) Tidy whitespace: no more than one blank line, trim each line.
  text = text
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/g, '').replace(/^[ \t]+/, (m) => (m.length > 3 ? '' : m)))
    .join('\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();


  return text;
}

const TEXT_KEYS = ['reply', 'message', 'text', 'content', 'answer', 'response', 'output'];

function extractFromJson(candidate: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return null;
  }
  const collected: string[] = [];
  const walk = (node: unknown, depth = 0) => {
    if (depth > 6 || node == null) return;
    if (typeof node === 'string') return;
    if (Array.isArray(node)) {
      node.forEach((n) => walk(n, depth + 1));
      return;
    }
    if (typeof node === 'object') {
      for (const key of TEXT_KEYS) {
        const value = (node as Record<string, unknown>)[key];
        if (typeof value === 'string' && value.trim()) collected.push(value.trim());
      }
      Object.values(node as Record<string, unknown>).forEach((v) => walk(v, depth + 1));
    }
  };
  walk(parsed);
  if (!collected.length) return null;
  // Deduplicate while preserving order.
  return Array.from(new Set(collected)).join('\n\n');
}

export type ChatTextBlock =
  | { kind: 'paragraph'; lines: string[] }
  | { kind: 'list'; ordered: boolean; items: string[] };

/** Groups sanitized text into paragraphs and bullet/numbered lists. */
export function toChatBlocks(text: string): ChatTextBlock[] {
  const blocks: ChatTextBlock[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', lines: paragraph });
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push({ kind: 'list', ordered: list.ordered, items: list.items });
    list = null;
  };

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    const bullet = line.match(/^(?:[-*•▪]|\u2022)\s+(.*)$/);
    const numbered = line.match(/^(\d{1,2})[.)]\s+(.*)$/);
    if (bullet || numbered) {
      flushParagraph();
      const ordered = Boolean(numbered);
      const item = (bullet ? bullet[1] : numbered![2]).trim();
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push(item);
      continue;
    }
    flushList();
    paragraph.push(line.replace(/^#{1,6}\s+/, ''));
  }
  flushParagraph();
  flushList();
  return blocks;
}
