import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { BROKER_LICENSE_PATTERN, INVALID_BROKER_LICENSE, BROKER_REGISTRY_UNAVAILABLE } from '../../supabase/functions/_shared/brokerRegistry';
export { INVALID_BROKER_LICENSE };
export const brokerLicenseSchema = z.string().regex(BROKER_LICENSE_PATTERN, INVALID_BROKER_LICENSE);
export const brokerLicenseDigits = (value: string) => value.replace(/[^0-9]/g, '').slice(0, 10);
const PENDING_LICENSE_KEY = 'toraf-pending-broker-license';

export function savePendingBrokerLicense(value: string) {
  try { if (value) localStorage.setItem(PENDING_LICENSE_KEY, value); else localStorage.removeItem(PENDING_LICENSE_KEY); } catch { /* Intent only; no grants. */ }
}
export function readPendingBrokerLicense() {
  try { return localStorage.getItem(PENDING_LICENSE_KEY) ?? ''; } catch { return ''; }
}
export type BrokerVerificationResult = { licenseNumber: string; holderName?: string; city?: string; active?: boolean; profile?: { id: string; full_name: string; city: string | null; broker_license_number: string; locked_broker_name: string; locked_broker_city: string; phone: string | null; gender?: string | null } };
export async function verifyBrokerLicense(value: string, action?: 'check' | 'verify'): Promise<string>;
export async function verifyBrokerLicense(value: string, action: 'check' | 'verify', withName: true): Promise<BrokerVerificationResult>;
export async function verifyBrokerLicense(value: string, action: 'check' | 'verify' = 'check', withName = false): Promise<string | BrokerVerificationResult> {
  const licenseNumber = brokerLicenseSchema.parse(brokerLicenseDigits(value.trim()).replace(/^0+/, ''));
  const { data, error } = await supabase.functions.invoke('verify-broker-license', { body: { licenseNumber, action } });
  if (error) {
    const detail = await error.context?.json?.().catch(() => null);
    throw new Error(detail?.message || BROKER_REGISTRY_UNAVAILABLE);
  }
  if (data?.valid !== true) throw new Error(data?.message || INVALID_BROKER_LICENSE);
  return withName ? { licenseNumber, holderName: typeof data?.holderName === 'string' ? data.holderName : undefined, city: data?.city, active: data?.active, profile: data?.profile } : licenseNumber;
}