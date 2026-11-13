export function communityPeerId(message: { sender_id: string; recipient_id: string }, userId: string): string | null {
  if (message.sender_id === userId) return message.recipient_id;
  if (message.recipient_id === userId) return message.sender_id;
  return null;
}

export function communityMessageContent(value: string): string | null {
  const content = value.trim();
  return content.length >= 1 && content.length <= 4000 ? content : null;
}export const DEAL_SAFETY_TIP = "💡 טיפ לעסקה בטוחה: ניהול שיתופי הפעולה וחלוקת העמלות דרך 'טוראף' מבטיח גיבוי, מעקב ריטה ותיעוד מלא.";
