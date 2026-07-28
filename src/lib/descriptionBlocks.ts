/**
 * Client-side twin of `supabase/functions/_shared/descriptionFilter.ts`, plus
 * the multi-source description block builder used by the details view.
 */

const BOILERPLATE_RE = [
  /אנחנו משתמשים בעוגיות/,
  /עוגיות|קובצי\s*cookie|cookies?\b/i,
  /מדיניות\s*(ה)?פרטיות|תנאי\s*שימוש|תקנון\s*האתר/,
  /כל\s*הזכויות\s*שמורות/,
  /accept\s+(all\s+)?cookies|cookie\s+(policy|consent|settings)/i,
  /privacy\s+policy|terms\s+of\s+(use|service)/i,
  /נא\s*להפעיל\s*javascript|enable\s+javascript/i,
  /לוח\s*מודעות|יד\s?2\s*בע"?מ/,
  /דיווח\s*על\s*מודעה|מודעה\s*זו\s*הוסרה/,
];

export function isBoilerplateDescription(text: string | null | undefined): boolean {
  const v = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!v) return true;
  return BOILERPLATE_RE.some((re) => re.test(v));
}

export function sanitizeDescription(text: string | null | undefined, minLength = 20): string | null {
  const v = (text ?? '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();
  if (!v || v.length < minLength) return null;
  if (isBoilerplateDescription(v)) return null;
  return v;
}

export type DescriptionBlock = { source: string; text: string };

function normalize(s: string) {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Collects every distinct description we hold for a listing and labels it with
 * its source, so the UI can stack them as `Source:\n<text>`.
 */
export function buildDescriptionBlocks(row: any): DescriptionBlock[] {
  if (!row) return [];
  const meta = (row.source_metadata && typeof row.source_metadata === 'object' ? row.source_metadata : {}) as any;
  const src = String(row.source ?? '').toLowerCase();
  const url = String(row.source_url ?? '');
  const isYad2 = /yad2/.test(src) || /yad2\.co\.il/i.test(url);
  const isHomely = /homely|webtiv/.test(src);

  const primaryLabel = isYad2 ? 'יד2' : isHomely ? 'הומלי' : 'תיאור הנכס';

  const candidates: DescriptionBlock[] = [
    { source: isYad2 ? 'יד2 · על הנכס' : primaryLabel, text: row.long_description },
    { source: primaryLabel, text: row.description },
    { source: primaryLabel, text: row.short_description },
    { source: 'יד2 · על הנכס', text: meta.yad2_description ?? meta.about ?? null },
    { source: 'הומלי', text: meta.homely_description ?? meta.homely?.description ?? null },
    { source: 'WebTiv', text: meta.webtiv_description ?? null },
  ].filter((b) => typeof b.text === 'string');

  const seen = new Set<string>();
  const blocks: DescriptionBlock[] = [];
  for (const c of candidates) {
    const text = sanitizeDescription(c.text);
    if (!text) continue;
    const key = normalize(text);
    if (seen.has(key)) continue;
    // Skip a candidate fully contained in an already-kept longer block.
    if ([...seen].some((k) => k.includes(key))) continue;
    seen.add(key);
    blocks.push({ source: c.source, text });
  }
  return blocks;
}
