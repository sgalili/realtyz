/**
 * Strips model envelope artefacts (```json fences, JSON wrappers, literal \n)
 * from an AI reply before it is sent to WhatsApp or stored in `messages`.
 */
export function sanitizeReplyText(raw: string | null | undefined): string {
  if (!raw) return "";
  let text = String(raw).trim();

  text = text.replace(/```[a-zA-Z]*\s*([\s\S]*?)```/g, "$1").trim();
  text = text.replace(/^```[a-zA-Z]*\s*/i, "").replace(/```$/, "").trim();
  text = text.replace(/^json\s*[\r\n]+/i, "").trim();

  if (/\\n|\\"|\\t/.test(text)) {
    text = text
      .replace(/\\r\\n|\\n|\\r/g, "\n")
      .replace(/\\t/g, "  ")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }

  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      const keys = ["reply", "message", "text", "content", "answer", "response"];
      const found: string[] = [];
      const walk = (node: unknown, depth = 0) => {
        if (depth > 5 || node == null || typeof node !== "object") return;
        if (Array.isArray(node)) { node.forEach((n) => walk(n, depth + 1)); return; }
        const obj = node as Record<string, unknown>;
        for (const k of keys) {
          const v = obj[k];
          if (typeof v === "string" && v.trim()) found.push(v.trim());
        }
        Object.values(obj).forEach((v) => walk(v, depth + 1));
      };
      walk(parsed);
      if (found.length) text = Array.from(new Set(found)).join("\n\n");
    } catch { /* not JSON — leave as-is */ }
  }

  text = text.replace(/^\s*\[(?:whatsapp|instagram|facebook|messenger|email|sms|telegram|web)\]\s*/i, "");
  text = text.replace(/\[[0-9a-f]{6,8}\]\s*/gi, "");

  return text
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
