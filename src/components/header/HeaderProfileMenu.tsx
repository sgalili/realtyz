import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, LogOut, Shield, ShieldCheck, User, Wallet, Repeat } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { useWhiteLabel } from '@/hooks/useWhiteLabel';
import { useWorkspace } from '@/hooks/useWorkspace';
import { DEMO_EXIT_PENDING_KEY } from '@/lib/demoGuard';
import { cn } from '@/lib/utils';

type Item = {
  label: string;
  icon: typeof User;
  to: string;
  iconClass?: string;
  requires?: 'managing_broker';
};

const ITEMS: Item[] = [
  { label: 'הפרופיל שלי', icon: User, to: '/profile', iconClass: 'text-primary' },
  { label: 'ניהול חבילה ויתרה', icon: Crown, to: '/billing?tab=plan', iconClass: 'text-warning' },
  { label: 'מנהלים מורשים', icon: ShieldCheck, to: '/team', iconClass: 'text-primary-glow', requires: 'managing_broker' },
  { label: 'חשבוניות ותשלומים', icon: Wallet, to: '/billing?tab=finance', iconClass: 'text-primary-glow' },
];

export function HeaderProfileMenu() {
  const [open, setOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { isManagingBroker, isSuperAdmin } = useUserRole();
  const { workspaces, openSelector, activeWorkspace } = useWorkspace();

  const { settings: brand } = useWhiteLabel();

  if (!user) return null;

  const meta = (user.user_metadata ?? {}) as Record<string, any>;
  const avatarUrl: string | null =
    meta.avatar_url || meta.picture || meta.profile_picture_url || null;
  const displayName = meta.full_name || meta.name || user.email || (user as any).phone || 'משתמש';
  const initial = displayName.slice(0, 1);

  const goProfile = () => navigate('/profile');
  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const confirmSignOut = async () => {
    window.localStorage.setItem(DEMO_EXIT_PENDING_KEY, 'true');
    window.localStorage.setItem('realtyz-demo-mode', 'false');
    window.localStorage.setItem('realtyz-authenticated-session', 'false');
    await signOut();
    window.location.replace('/auth');
  };

  const visibleItems = ITEMS.filter((it) => !it.requires || (it.requires === 'managing_broker' && isManagingBroker));

  const agencyName = brand?.agency_name ?? '';
  const agencyLogo = brand?.logo_url ?? '';

  return (
    <>
      <div dir="rtl" className="flex items-center gap-2">

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="תפריט פרופיל"
              className={cn(
                'relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-foreground/15 text-xs font-bold text-primary-foreground ring-1 ring-primary-foreground/30 transition hover:bg-primary-foreground/25',
              )}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
              ) : (
                initial
              )}
              {activeWorkspace?.workspace_logo_url && (
                <span className="absolute -bottom-0.5 -left-0.5 flex h-4 w-4 items-center justify-center overflow-hidden rounded-[3px] bg-white ring-1 ring-[hsl(var(--header-bg))] shadow">
                  <img
                    src={activeWorkspace.workspace_logo_url}
                    alt={activeWorkspace.workspace_name}
                    className="h-full w-full object-contain"
                  />
                </span>
              )}
              {isSuperAdmin && !activeWorkspace?.workspace_logo_url && (
                <span className="absolute -bottom-0.5 -left-0.5 h-2.5 w-2.5 rounded-full bg-warning ring-2 ring-[hsl(var(--header-bg))]" />
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent side="bottom" align="end" dir="rtl" sideOffset={10} className="w-64 p-1.5">
            {(agencyLogo || agencyName) && (
              <div className="flex items-center gap-2 border-b border-border/60 px-2.5 py-2 mb-1">
                {agencyLogo && (
                  <img src={agencyLogo} alt={agencyName || 'Agency logo'} className="h-6 w-auto max-w-[80px] object-contain" />
                )}
                {agencyName && (
                  <span className="truncate text-xs font-bold text-primary">{agencyName}</span>
                )}
              </div>
            )}
            <div className="border-b border-border/60 px-2.5 py-2 mb-1">
              <p className="truncate text-xs font-semibold text-[#0b3982]">{displayName}</p>
              <p className="truncate text-[10px] text-muted-foreground">{user.email}</p>
            </div>
            <div className="flex flex-col">
              {visibleItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.to}
                    type="button"
                    onClick={() => go(item.to)}
                    className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-right text-sm text-[#0b3982] transition-colors hover:bg-[#0b3982]/10"
                  >
                    <Icon className={cn('h-4 w-4 shrink-0 text-[#0b3982]')} />
                    <span className="flex-1">{item.label}</span>
                  </button>
                );
              })}
              {workspaces.length > 1 && (
                <button
                  type="button"
                  onClick={() => { setOpen(false); openSelector(); }}
                  className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-right text-sm text-[#0b3982] transition-colors hover:bg-[#0b3982]/10"
                >
                  <Repeat className="h-4 w-4 shrink-0 text-[#0b3982]" />
                  <span className="flex-1">החלף מרחב עבודה</span>
                </button>
              )}
              {isSuperAdmin && (
                <button
                  type="button"
                  onClick={() => go('/super-admin')}
                  className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-right text-sm text-[#0b3982] transition-colors hover:bg-[#0b3982]/10"
                >
                  <Shield className="h-4 w-4 shrink-0 text-[#0b3982]" />
                  <span className="flex-1">ממשק ניהול על</span>
                </button>
              )}
              <div className="my-1 border-t border-border/60" />
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setLogoutOpen(true);
                }}
                className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-right text-sm text-destructive transition-colors hover:bg-destructive/10"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                <span className="flex-1">התנתקות</span>
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <AlertDialogContent dir="rtl" className="text-right">
          <AlertDialogHeader className="text-right">
            <AlertDialogTitle>להתנתק מהמערכת?</AlertDialogTitle>
            <AlertDialogDescription>לאחר ההתנתקות תועבר למסך הכניסה.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:justify-start sm:space-x-0">
            <AlertDialogAction onClick={confirmSignOut}>התנתקות</AlertDialogAction>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default HeaderProfileMenu;
