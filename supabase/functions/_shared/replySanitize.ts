/**
 * Strips model envelope artefacts (```json fences, JSON wrappers, literal \n,
 * leaked CRM action schemas) from an AI reply before it is sent to WhatsApp or
 * stored in `messages`. Raw JSON must never reach a human.
 */
import { stripRawJson } from "./agentOutput.ts";

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

  // Channel tags are stripped ANYWHERE in the text, not only at the start.
  text = text.replace(/\[\s*(?:whatsapp|wa|instagram|ig|facebook|fb|messenger|email|mail|sms|telegram|web|chat|inbound|outbound)\s*\]/gi, " ");
  text = text.replace(/\[[0-9a-f]{6,}\]/gi, " ");
  // Internal markers must never reach a human, even if the model echoes them.
  text = text.replace(/\[ref[:=]\s*[A-Za-z0-9_-]{4,}\]?/gi, "");
  text = text.replace(/\[(?:AGENT_COMMAND|REFERRAL_CONTEXT)[^\]]*\]/gi, "");
  // Bare UUIDs / long hashes and debug key=value pairs the model may echo.
  text = text.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "");
  text = text.replace(/\b[0-9a-f]{24,}\b/gi, "");
  text = text.replace(
    /\b(?:lead_id|listing_id|workspace_owner_id|workspace_id|external_id|message_id|user_id|thread_id|channel|platform|source_metadata|scrape_token|slug)\s*[:=]\s*\S+/gi,
    "",
  );
  // Leftover empty brackets/parentheses after stripping internal markers.
  text = text.replace(/\[\s*\]|\(\s*\)/g, " ");
  text = text.replace(/^\s*(?:===\s*)?(?:REALTYZ MASTER AGENT DIRECTIVE|END MASTER AGENT DIRECTIVE)[^\n]*\n?/gim, "");
  text = text.replace(/\*\*\s*\*\*/g, "").replace(/__\s*__/g, "");

  // Final hard guard: no code fences, JSON blobs or action schemas survive.
  text = stripRawJson(text);

  return text
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

