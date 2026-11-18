import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export type InvitationAttachment = { id: string; file_name: string; mime_type: string | null; storage_path: string };
const BUCKET = 'invitation-attachments';

/** Loads a Super Admin library attachment by id (service client); null id means none. */
export async function loadAttachment(admin: SupabaseClient, id?: string | null): Promise<InvitationAttachment | null> {
  if (!id) return null;
  const { data, error } = await admin.from('invitation_attachments').select('id,file_name,mime_type,storage_path').eq('id', id).maybeSingle();
  if (error || !data) throw new Error('הקובץ המצורף לא נמצא');
  return data as InvitationAttachment;
}

export async function attachmentBase64(admin: SupabaseClient, a: InvitationAttachment): Promise<string> {
  const { data, error } = await admin.storage.from(BUCKET).download(a.storage_path);
  if (error || !data) throw new Error('קריאת הקובץ המצורף נכשלה');
  const bytes = new Uint8Array(await data.arrayBuffer());
  let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Seven-day signed link so Meta can fetch the document. */
export async function attachmentSignedUrl(admin: SupabaseClient, a: InvitationAttachment): Promise<string> {
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(a.storage_path, 60 * 60 * 24 * 7);
  if (error || !data?.signedUrl) throw new Error('יצירת קישור לקובץ נכשלה');
  return data.signedUrl;
}

export const markAttachmentSent = (admin: SupabaseClient, id: string) => admin.from('invitation_attachments').update({ last_sent_at: new Date().toISOString() }).eq('id', id);
