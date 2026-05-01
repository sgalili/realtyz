// Parser for exported WhatsApp .txt chat files.
// Supports common formats:
//   [12.3.2024, 14:05:33] Sharon: Hi
//   [3/12/24, 2:05:33 PM] Sharon: Hi
//   12/03/2024, 14:05 - Sharon: Hi
//   12.3.2024, 14:05 - Sharon: Hi
// System notifications (group subject changes, encryption notices, "joined", etc.) are skipped.
// Output groups consecutive messages from the same sender into "turns" and pairs them
// into Agent ↔ Prospect conversation chunks suitable for embedding in the Strategy Bank.

export interface WhatsAppMessage {
  date: string;
  time: string;
  sender: string;
  content: string;
}

export interface ConversationTurn {
  sender: string;
  role: "agent" | "prospect";
  content: string;
  date: string;
  time: string;
}

export interface ConversationChunk {
  title: string;
  text: string;
  turn_count: number;
  start_date: string;
  end_date: string;
}

export interface ParseResult {
  messages: WhatsAppMessage[];
  turns: ConversationTurn[];
  chunks: ConversationChunk[];
  agentName: string | null;
  participants: string[];
}

// Regex that matches both bracketed [date, time] and dash-separated "date, time -" formats.
// Captures: date, time, sender, content.
const LINE_RE =
  /^\[?(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[APap][Mm])?)\]?\s*[-–]?\s*([^:]{1,80}?):\s?([\s\S]*)$/;

const SYSTEM_PATTERNS: RegExp[] = [
  /messages and calls are end-to-end encrypted/i,
  /ההודעות והשיחות מוצפנות/i,
  /changed the group (subject|description|icon)/i,
  /שינה את נושא הקבוצה/i,
  /שינה את תיאור הקבוצה/i,
  /added|removed|left|joined/i,
  /הוסיף|הסיר|עזב|הצטרף/i,
  /you created group/i,
  /יצרת את הקבוצה/i,
  /security code changed/i,
  /קוד האבטחה השתנה/i,
  /<Media omitted>/i,
  /הושמטה מדיה/i,
  /image omitted|video omitted|audio omitted|sticker omitted|gif omitted|document omitted/i,
];

function isSystemMessage(sender: string, content: string): boolean {
  const text = `${sender}: ${content}`;
  return SYSTEM_PATTERNS.some((re) => re.test(text));
}

export function parseWhatsAppChat(raw: string, opts?: { agentName?: string }): ParseResult {
  // Normalize unicode bidi chars WhatsApp likes to inject.
  const cleaned = raw.replace(/[\u200e\u200f\u202a-\u202e]/g, "");
  const lines = cleaned.split(/\r?\n/);

  const messages: WhatsAppMessage[] = [];
  let current: WhatsAppMessage | null = null;

  for (const line of lines) {
    if (!line.trim()) continue;
    const m = line.match(LINE_RE);
    if (m) {
      const [, date, time, sender, content] = m;
      if (current) messages.push(current);
      const senderTrim = sender.trim();
      const contentTrim = (content ?? "").trim();
      if (isSystemMessage(senderTrim, contentTrim)) {
        current = null;
        continue;
      }
      current = { date, time, sender: senderTrim, content: contentTrim };
    } else if (current) {
      // Continuation of previous multi-line message.
      current.content += `\n${line.trim()}`;
    }
  }
  if (current) messages.push(current);

  // Determine agent: explicit override, else most frequent sender.
  const counts = new Map<string, number>();
  for (const msg of messages) counts.set(msg.sender, (counts.get(msg.sender) ?? 0) + 1);
  const participants = Array.from(counts.keys());
  const agentName =
    opts?.agentName ??
    (participants.length
      ? participants.reduce((a, b) => ((counts.get(a)! >= counts.get(b)!) ? a : b))
      : null);

  // Group consecutive same-sender messages into turns.
  const turns: ConversationTurn[] = [];
  for (const msg of messages) {
    const role: "agent" | "prospect" = msg.sender === agentName ? "agent" : "prospect";
    const last = turns[turns.length - 1];
    if (last && last.sender === msg.sender) {
      last.content += `\n${msg.content}`;
      last.date = msg.date;
      last.time = msg.time;
    } else {
      turns.push({ sender: msg.sender, role, content: msg.content, date: msg.date, time: msg.time });
    }
  }

  // Build chunks: ~8 turns per chunk, capped at ~3500 chars, prefer ending after a prospect→agent pair.
  const chunks: ConversationChunk[] = [];
  const TURNS_PER_CHUNK = 8;
  const MAX_CHARS = 3500;
  let buffer: ConversationTurn[] = [];
  let bufferChars = 0;

  const flush = () => {
    if (buffer.length === 0) return;
    const text = buffer
      .map((t) => `${t.role === "agent" ? "Agent" : "Prospect"} (${t.sender}) [${t.date} ${t.time}]: ${t.content}`)
      .join("\n");
    chunks.push({
      title: `WhatsApp · ${buffer[0].date} → ${buffer[buffer.length - 1].date}`,
      text,
      turn_count: buffer.length,
      start_date: buffer[0].date,
      end_date: buffer[buffer.length - 1].date,
    });
    buffer = [];
    bufferChars = 0;
  };

  for (const turn of turns) {
    const turnLen = turn.content.length + turn.sender.length + 30;
    if (buffer.length >= TURNS_PER_CHUNK || bufferChars + turnLen > MAX_CHARS) flush();
    buffer.push(turn);
    bufferChars += turnLen;
  }
  flush();

  return { messages, turns, chunks, agentName, participants };
}
