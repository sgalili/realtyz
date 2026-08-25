import { Fragment, useMemo } from 'react';
import { sanitizeChatText, toChatBlocks } from '@/lib/chatTextSanitizer';

/**
 * Renders a chat message body as clean text: markdown bold/italic, bullet and
 * numbered lists, and real line breaks. Raw JSON envelopes and code-fence
 * tokens are stripped upstream by `sanitizeChatText`.
 */
export function ChatMessageText({ content, className }: { content: string | null | undefined; className?: string }) {
  const blocks = useMemo(() => toChatBlocks(sanitizeChatText(content)), [content]);
  if (!blocks.length) return null;

  return (
    <div className={`max-w-full overflow-hidden break-words text-sm leading-relaxed ${className ?? ''}`}>
      {blocks.map((block, i) =>
        block.kind === 'list' ? (
          block.ordered ? (
            <ol key={i} className="my-1 list-decimal space-y-0.5 pe-4 ps-4">
              {block.items.map((item, j) => (
                <li key={j} className="marker:text-muted-foreground">
                  <Inline text={item} />
                </li>
              ))}
            </ol>
          ) : (
            <ul key={i} className="my-1 list-disc space-y-0.5 pe-4 ps-4">
              {block.items.map((item, j) => (
                <li key={j} className="marker:text-muted-foreground">
                  <Inline text={item} />
                </li>
              ))}
            </ul>
          )
        ) : (
          <p key={i} className={i > 0 ? 'mt-2' : undefined}>
            {block.lines.map((line, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                <Inline text={line} />
              </Fragment>
            ))}
          </p>
        ),
      )}
    </div>
  );
}

/** Inline markdown: **bold**, *italic*, `code`, and bare links. */
function Inline({ text }: { text: string }) {
  const parts = useMemo(() => splitInline(text), [text]);
  return (
    <>
      {parts.map((part, i) => {
        if (part.type === 'bold') return <strong key={i} className="font-semibold">{part.value}</strong>;
        if (part.type === 'italic') return <em key={i}>{part.value}</em>;
        if (part.type === 'code')
          return (
            <code key={i} className="rounded bg-muted px-1 py-0.5 text-[0.85em]">
              {part.value}
            </code>
          );
        if (part.type === 'link')
          return (
            <a
              key={i}
              href={part.value}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2"
            >
              {part.value}
            </a>
          );
        return <Fragment key={i}>{part.value}</Fragment>;
      })}
    </>
  );
}

type InlinePart = { type: 'text' | 'bold' | 'italic' | 'code' | 'link'; value: string };

const INLINE_RE = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\n]+\*|_[^_\n]+_|https?:\/\/[^\s<>"')]+)/g;

function splitInline(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE_RE)) {
    const token = match[0];
    const start = match.index ?? 0;
    if (start > last) parts.push({ type: 'text', value: text.slice(last, start) });
    if (token.startsWith('**') || token.startsWith('__')) {
      parts.push({ type: 'bold', value: token.slice(2, -2) });
    } else if (token.startsWith('`')) {
      parts.push({ type: 'code', value: token.slice(1, -1) });
    } else if (token.startsWith('http')) {
      parts.push({ type: 'link', value: token });
    } else {
      parts.push({ type: 'italic', value: token.slice(1, -1) });
    }
    last = start + token.length;
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });
  return parts;
}
