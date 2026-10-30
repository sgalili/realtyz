import { profileGender } from '@/i18n/personalLanguage';

export type ProfileContacts = { emails: { id: string; value: string }[]; whatsapps: { id: string; value: string }[]; phones: { id: string; value: string }[]; fullName: string; city: string };
export type ProfileSaveField = keyof ProfileContacts | 'gender' | 'brokerLicense';

/** Merge only the explicitly confirmed field, never other unfinished edits. */
export function profileFieldChange(field: ProfileSaveField, value: string | ProfileContacts[keyof ProfileContacts], saved: ProfileContacts) {
  const contacts = field in saved ? { ...saved, [field]: value } as ProfileContacts : saved;
  let patch: Record<string, string | null>;
  switch (field) {
    case 'fullName': patch = { full_name: String(value).trim() || null }; break;
    case 'city': patch = { city: String(value).trim() || null }; break;
    case 'gender': patch = { gender: profileGender(value) }; break;
    case 'emails': patch = { email: contacts.emails[0]?.value.trim() || null }; break;
    case 'phones':
    case 'whatsapps': patch = { phone: contacts.whatsapps[0]?.value || contacts.phones[0]?.value || null }; break;
    case 'brokerLicense': patch = { broker_license_number: String(value).trim() || null }; break;
  }
  return { contacts, patch };
}