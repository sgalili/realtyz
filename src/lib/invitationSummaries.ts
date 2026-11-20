export type SummaryRole = 'developer' | 'marketing_company' | 'broker' | 'property_owner' | 'affiliate';
export const SUMMARY_ROLES: { value: SummaryRole; label: string }[] = [
  { value: 'developer', label: 'יזם' },
  { value: 'marketing_company', label: 'חברת שיווק נדל"ן' },
  { value: 'broker', label: 'מתווך' },
  { value: 'property_owner', label: 'בעל נכס' },
  { value: 'affiliate', label: 'שותף' },
];
/** Id of the executive summary assigned to this recipient type, if one was uploaded. */
export function defaultSummaryId(files: { id: string; summary_role: string | null }[], role?: SummaryRole | null): string | null {
  if (!role) return null;
  return files.find(f => f.summary_role === role)?.id ?? null;
}
export type RecipientGroup = 'marketing' | 'broker' | 'developer';
/** Invitation recipient group: a developer invite that went to a marketing company counts as marketing. */
export function recipientGroup(i: { recipient_kind?: string | null }, marketingCompany?: string | null): RecipientGroup {
  if (i.recipient_kind === 'marketing_company' || (i.recipient_kind === 'developer' && marketingCompany?.trim())) return 'marketing';
  return i.recipient_kind === 'developer' ? 'developer' : 'broker';
}
