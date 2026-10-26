import { createContext, useContext, useEffect, type ReactNode, isValidElement, cloneElement } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { profileGender, genderText, localizeCommand, type PersonalGender, type GenderText } from '../../supabase/functions/_shared/personalLanguage';
export { genderText, profileGender, localizeCommand };
export type { PersonalGender, GenderText };
export const personalGenderKey = (userId: string) => ['personal-language', userId] as const;
const Context = createContext<PersonalGender>(null);
let currentGender: PersonalGender = null;
export const personalText = (forms: GenderText) => genderText(currentGender, forms);
export function PersonalLanguageProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const cache = useQueryClient();
  const { data } = useQuery({
    queryKey: personalGenderKey(user?.id ?? 'guest'), enabled: !!user,
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase.from('profiles').select('gender').eq('id', user.id).maybeSingle();
      if (error) throw error;
      return profileGender(data?.gender);
    },
  });
  const gender = user ? data ?? null : null;
  useEffect(() => { currentGender = gender; return () => { currentGender = null; }; }, [gender]);
  useEffect(() => {
    const refresh = () => { if (user) void cache.invalidateQueries({ queryKey: personalGenderKey(user.id) }); };
    window.addEventListener('realtyz:profile-saved', refresh);
    return () => window.removeEventListener('realtyz:profile-saved', refresh);
  }, [user?.id, cache]);
  return <Context.Provider value={gender}>{children}</Context.Provider>;
}
export function usePersonalLanguage() {
  const gender = useContext(Context);
  return { gender, text: (forms: GenderText) => genderText(gender, forms), command: (text?: string) => localizeCommand(text, gender) };
}
/** For authored control labels only; does not walk the DOM or edit input values. */
export function localizeControlNode(node: ReactNode, gender: PersonalGender): ReactNode {
  if (typeof node === 'string') return localizeCommand(node, gender);
  if (Array.isArray(node)) return node.map(child => localizeControlNode(child, gender));
  if (isValidElement<{ children?: ReactNode }>(node) && typeof node.type === 'string' && node.props.children) {
    return cloneElement(node, undefined, localizeControlNode(node.props.children, gender));
  }
  return node;
}