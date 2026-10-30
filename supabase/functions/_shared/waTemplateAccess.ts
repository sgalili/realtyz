export const RITA_TEMPLATE_OWNER = 'dc819834-1aa9-4aca-bb27-ec2c8cebde69';
export function canUseWaTemplate(name: string, ownerId: string | null | undefined): boolean {
  return name !== 'invitation_to_realestate_brokers' || ownerId === RITA_TEMPLATE_OWNER;
}