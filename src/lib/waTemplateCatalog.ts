import type { MetaWaTemplate } from '@/hooks/useMetaWaTemplates';

/** Audience a template is relevant to. Meta technical names stay untouched. */
export type WaTemplateAudience = 'broker' | 'owner' | 'developer' | 'private' | 'partner' | 'admin';

type CatalogEntry = { label: string; audiences: WaTemplateAudience[] };

/** Hebrew display names for approved Meta templates (technical name → UI label). */
export const WA_TEMPLATE_CATALOG: Record<string, CatalogEntry> = {
  invitation_to_realestate_brokers: { label: 'הזמנת מתווכים להצטרף ל-TORAFF', audiences: ['admin'] },
  new_exclusive_listing_alert: { label: 'עדכון על נכס בלעדי חדש', audiences: ['broker', 'owner', 'developer', 'admin'] },
  new_lead_immediate_response: { label: 'מענה מיידי לליד חדש', audiences: ['broker', 'developer', 'admin'] },
  postviewing_feedback_request: { label: 'בקשת משוב לאחר סיור בנכס', audiences: ['broker', 'admin'] },
  reengagement: { label: 'חידוש קשר עם ליד', audiences: ['broker', 'owner', 'developer', 'partner', 'admin'] },
};

export function waTemplateLabel(name: string): string {
  return WA_TEMPLATE_CATALOG[name]?.label ?? name.replace(/_/g, ' ');
}

/** Legacy brand names inside template bodies render as TORAFF in the UI. */
export function rebrandTemplateText(text: string): string {
  return String(text ?? '').replace(/realtyz(\s*ai)?|realtys|ריאלטיז|ריאלטיס/gi, 'TORAFF');
}

/** One entry per name+language (the cache can hold the same template for several workspaces). */
export function dedupeTemplates(templates: MetaWaTemplate[]): MetaWaTemplate[] {
  const seen = new Set<string>();
  return templates.filter((t) => {
    const key = `${t.name}|${t.language}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Only catalogued templates relevant to the given audience (admins see every catalogued one). */
export function templatesForAudience(templates: MetaWaTemplate[], audience: WaTemplateAudience): MetaWaTemplate[] {
  return dedupeTemplates(templates).filter((t) => {
    const entry = WA_TEMPLATE_CATALOG[t.name];
    if (!entry) return false;
    return audience === 'admin' || entry.audiences.includes(audience);
  });
}

export function audienceFromIdentity(label: string, isAdmin: boolean): WaTemplateAudience {
  if (isAdmin) return 'admin';
  if (label === 'מתווך') return 'broker';
  if (label === 'יזם' || label === 'קבלן') return 'developer';
  if (label === 'מפרסם') return 'owner';
  if (label === 'פרטי') return 'private';
  return 'partner';
}

/** Personalization tags offered in the message editor, per audience. */
export function personalizationTagsFor(audience: WaTemplateAudience): string[] {
  if (audience === 'broker' || audience === 'admin' || audience === 'developer') return ['[שם_פרטי]', '[עיר]', '[נכס]'];
    if (audience === 'owner') return ['[שם_פרטי]', '[נכס]'];
  return ['[שם_פרטי]'];
}

/** Extracts unique Israeli mobile numbers (normalized 9725XXXXXXXX) from free text. */
export function extractWhatsAppNumbers(text: string): string[] {
  const out = new Set<string>();
  const candidates = String(text ?? '').match(/\+?\d[\d\s\-().]{7,18}\d/g) ?? [];
  for (const raw of candidates) {
    let d = raw.replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    if (d.startsWith('0')) d = `972${d.slice(1)}`;
    if (/^9725\d{8}$/.test(d)) out.add(d);
  }
  return [...out];
}
