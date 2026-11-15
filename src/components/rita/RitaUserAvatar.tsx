import { useQuery } from '@tanstack/react-query';
import { UserRound } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

export function RitaUserAvatar({ className = 'mt-0.5 h-7 w-7' }: { className?: string }) {
  const { user } = useAuth();
  const { data: avatarUrl } = useQuery({
    queryKey: ['rita-user-avatar', user?.id ?? null],
    enabled: !!user?.id,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('avatar_url').eq('id', user?.id ?? '').maybeSingle();
      return (data as { avatar_url?: string | null } | null)?.avatar_url ?? null;
    },
  });

  return <Avatar className={className}>
    <AvatarImage src={avatarUrl ?? undefined} alt="המשתמש" />
    <AvatarFallback className="bg-muted text-muted-foreground"><UserRound className="h-4 w-4" /></AvatarFallback>
  </Avatar>;
}
