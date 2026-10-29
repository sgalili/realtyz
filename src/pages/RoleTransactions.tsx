import { useUserRole } from '@/hooks/useUserRole';
import { useAppMode } from '@/hooks/useAppMode';
import { activityAudience } from '@/lib/activityAudience';
import PartnerContacts from './partner/PartnerContacts';
import PersonalTransactions from '@/components/properties/PersonalTransactions';
import DealRoom from './DealRoom';
export default function RoleTransactions() {
  const { roles, loading } = useUserRole(); const { isPartnerMode } = useAppMode();
  if (loading) return null;
  const audience = activityAudience(roles, isPartnerMode);
  return audience === 'partner' ? <PartnerContacts /> : audience === 'private' ? <PersonalTransactions /> : <DealRoom />;
}