import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const FUNNEL_ADDED_MESSAGE = 'הנכס נוסף בהצלחה לתור ההפצה האוטומטי!';

export function funnelErrorMessage(message: string): string {
  if (message.includes('not_authorized')) return 'יש להתחבר כדי להוסיף נכסים לתור ההפצה';
  if (message.includes('listing_not_available')) return 'הנכס אינו זמין להפצה כרגע';
  return 'ההוספה לתור ההפצה נכשלה';
}

/** One click, no charge: adds the property to the active workspace's automatic distribution queue. */
export async function addToDistributionFunnel(listingId: string): Promise<boolean> {
  const { data, error } = await (supabase as any).rpc('add_listing_to_distribution_funnel', { _listing: listingId });
  if (error) { toast.error(funnelErrorMessage(error.message ?? '')); return false; }
  if (data?.own_page === false) {
    toast.success(FUNNEL_ADDED_MESSAGE, { description: 'ההפצה תתחיל אחרי חיבור עמוד הפייסבוק העסקי שלך בעמוד החיבורים' });
  } else toast.success(FUNNEL_ADDED_MESSAGE);
  return true;
}
