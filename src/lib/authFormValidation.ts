import { z } from 'zod';

export const fullNameSchema = z.string().trim().min(1).max(200).refine(name => {
  const words = name.split(/\s+/u);
  return !name.includes('@') && words.length >= 2 && words.every(word => (word.match(/\p{L}/gu) ?? []).length >= 2);
});

export const validFullName = (value: string) => fullNameSchema.safeParse(value).success;
export const validAuthIdentifier = (value: string, phone: boolean) => phone
  ? z.string().regex(/^05\d{8}$/).safeParse(value.replace(/\D/g, '')).success
  : z.string().trim().email().max(255).safeParse(value).success;

export function authFormReady({ signup, signupType, fullName, brokerReady, identifier, phone }: {
  signup: boolean; signupType: string; fullName: string; brokerReady: boolean; identifier: string; phone: boolean;
}) {
  return validAuthIdentifier(identifier, phone) && brokerReady && (!signup || (Boolean(signupType) && validFullName(fullName)));
}