import { useState } from 'react';
import { ChevronDown, User, Crown, Wallet, LogOut, Shield, ShieldCheck, ArrowLeftRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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
import { useWorkspace } from '@/hooks/useWorkspace';
import { useSidebar } from '@/components/ui/sidebar';
import { DEMO_EXIT_PENDING_KEY } from '@/lib/demoGuard';
import { cn } from '@/lib/utils';

type CapsuleItem = {
  label: string;
  icon: typeof User;
  to: string;
  iconClass?: string;
  requires?: 'managing_broker' | 'super_admin';
};

const ITEMS: CapsuleItem[] = [
  { label: 'הפרופיל שלי', icon: User, to: '/api-settings', iconClass: 'text-primary' },
  { label: 'ניהול חבילה ויתרה', icon: Crown, to: '/subscription', iconClass: 'text-warning' },
  { label: 'מנהלים מורשים', icon: ShieldCheck, to: '/team', iconClass: 'text-primary-glow', requires: 'managing_broker' },
  { label: 'חשבוניות ותשלומים', icon: Wallet, to: '/finance', iconClass: 'text-primary-glow' },
];


export function ProfileCapsule() {
  const [open, setOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { isManagingBroker, isSuperAdmin } = useUserRole();
  const { workspaces, activeWorkspace, openSelector } = useWorkspace();
  const multiWorkspace = workspaces.length > 1;
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';

  // The capsule represents the WORKSPACE, not the individual user: show the
  // workspace logo and name, never the personal profile picture.
  const workspaceName = activeWorkspace?.workspace_name?.trim() || user?.email?.split('@')[0] || 'משתמש';
  const workspaceLogo = activeWorkspace?.workspace_logo_url || null;
  const initial = (workspaceName || 'U').slice(0, 1).toUpperCase();
  const displayName = workspaceName;

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

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'group flex w-full items-center gap-3 rounded-lg border border-border/60 bg-background px-3 py-2 text-right transition-all hover:bg-primary/5 hover:shadow-[0_10px_24px_-14px_hsl(var(--primary)/0.35)]',
              collapsed && 'justify-center px-2',
            )}
            aria-label="תפריט פרופיל"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {workspaceLogo
                ? <img src={workspaceLogo} alt={workspaceName} className="h-full w-full object-cover" loading="lazy" />
                : initial}
            </div>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1 text-right">
                  <p className="truncate text-xs font-semibold text-primary">{displayName}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{user?.email}</p>
                </div>
                {isSuperAdmin && (
                  <span className="shrink-0 rounded-full bg-warning/15 px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none tracking-wider text-warning">
                    Admin
                  </span>
                )}
                {multiWorkspace && (
                  <span
                    role="button"
                    tabIndex={0}
                    title="החלף מרחב עבודה"
                    aria-label="החלף מרחב עבודה"
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); openSelector(); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); openSelector(); }
                    }}
                    className="shrink-0 inline-flex items-center gap-1 rounded-md border border-primary/25 bg-primary/5 px-1.5 py-1 text-[10px] font-semibold text-primary transition-colors hover:bg-primary/15"
                  >
                    <ArrowLeftRight className="h-3.5 w-3.5" />
                    החלפה
                  </span>
                )}

                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              </>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="bottom"
          align="end"
          dir="rtl"
          className="w-60 p-1.5"
          sideOffset={8}
        >
          <div className="border-b border-border/60 px-2.5 py-2 mb-1">
            <p className="truncate text-xs font-semibold text-primary">{displayName}</p>
            <p className="truncate text-[10px] text-muted-foreground">{user?.email}</p>
          </div>
          <div className="flex flex-col">
            {visibleItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.to}
                  type="button"
                  onClick={() => go(item.to)}
                  className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-right text-sm text-primary transition-colors hover:bg-primary/10"
                >
                  <Icon className={cn('h-4 w-4 shrink-0', item.iconClass ?? 'text-primary')} />
                  <span className="flex-1">{item.label}</span>
                </button>
              );
            })}
            {isSuperAdmin && (
              <button
                type="button"
                onClick={() => go('/super-admin')}
                className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-right text-sm text-primary transition-colors hover:bg-primary/10"
              >
                <Shield className="h-4 w-4 shrink-0 text-warning" />
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
