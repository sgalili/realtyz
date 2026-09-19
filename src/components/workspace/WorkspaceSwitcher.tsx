import { useEffect, useMemo, useState } from 'react';
import { Building2, Check, ChevronsUpDown, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useUserRole } from '@/hooks/useUserRole';
import { resolveWorkspaceIdentity, workspaceInitial } from '@/lib/workspaceIdentity';
import { useWhiteLabel } from '@/hooks/useWhiteLabel';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useSidebar } from '@/components/ui/sidebar';

/**
 * Sidebar workspace switcher. The left circle shows the signed-in user's
 * personal profile picture and navigates to /profile; the right side keeps the
 * active workspace branding and lets users with several workspaces switch.
 */
export function WorkspaceSwitcher({ className }: { className?: string }) {
  const { workspaces, activeWorkspace, activeWorkspaceId, setActiveWorkspace } = useWorkspace();
  const { settings } = useWhiteLabel();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);
  const { isMobile, setOpenMobile } = useSidebar();

  useEffect(() => {
    if (!user?.id) {
      setProfileAvatarUrl(null);
      return;
    }
    supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => setProfileAvatarUrl((data as any)?.avatar_url ?? null));
  }, [user?.id]);

  const { isSuperAdmin } = useUserRole();
  const [query, setQuery] = useState('');

  const identity = resolveWorkspaceIdentity(activeWorkspace, settings as any);

  const visibleWorkspaces = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return workspaces;
    return workspaces.filter((w) =>
      [w.workspace_name, w.owner_full_name, w.owner_email].some((v) => (v ?? '').toLowerCase().includes(q)),
    );
  }, [workspaces, query]);

  // Super admins always get the switcher, even with a single own workspace.
  const multi = isSuperAdmin || workspaces.length > 1;

  const pick = async (ownerId: string, label: string) => {
    if (ownerId === activeWorkspaceId) { setOpen(false); return; }
    setBusy(true);
    try {
      await setActiveWorkspace(ownerId);
      setOpen(false);
      window.dispatchEvent(new CustomEvent('realtyz:workspace-changed', { detail: { ownerId } }));
      toast.success(`מרחב העבודה הוחלף ל${label}`);
    } catch {
      // The workspace provider already surfaces a friendly error.
    } finally {
      setBusy(false);
    }
  };

  const goProfile = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate('/profile');
  };

  // The line under the workspace name is the ACTIVE workspace owner's name.
  const ownerLabel = (activeWorkspace?.owner_full_name ?? '').trim()
    || (activeWorkspace?.owner_email ?? '').trim()
    || (activeWorkspace?.workspace_name ?? '').trim();

  // Square workspace logo, shown on the side opposite the name + owner line.
  // Workspaces without any logo fall back to the workspace owner's picture.
  const squareLogo = (settings as any)?.logo_url
    ?? activeWorkspace?.workspace_logo_url
    ?? identity.logo
    ?? activeWorkspace?.owner_avatar_url
    ?? null;
  const logoIsOwnerPhoto = !((settings as any)?.logo_url
    || activeWorkspace?.workspace_logo_url
    || identity.logo) && !!activeWorkspace?.owner_avatar_url;

  const workspaceInfo = (
    <div className="min-w-0 flex-1 text-right">
      <div className="truncate text-sm font-bold text-slate-900">{identity.name}</div>
      <div className="truncate text-[11px] text-slate-500">{ownerLabel || '\u00a0'}</div>
    </div>
  );

  const workspaceLogoSquare = (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-background">
      {squareLogo ? (
        <img
          src={squareLogo}
          alt={identity.name}
          className={logoIsOwnerPhoto ? 'h-full w-full object-cover' : 'h-full w-full object-contain p-0.5'}
          referrerPolicy="no-referrer"
        />
      ) : (
        <span className="text-xs font-bold text-primary">{workspaceInitial(identity.name)}</span>
      )}
    </span>
  );

  return (
    <div className={cn('flex w-full items-center gap-2', className)}>
      <button
        type="button"
        onClick={goProfile}
        className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-900 text-xs font-bold text-white ring-1 ring-slate-200 transition-opacity hover:opacity-90"
        aria-label="הפרופיל שלי"
        title="הפרופיל שלי"
      >
        {profileAvatarUrl ? (
          <img
            src={profileAvatarUrl}
            alt="הפרופיל שלי"
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <User className="h-5 w-5" strokeWidth={1.5} />
        )}
      </button>

      {multi ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={busy}
              onClick={(e) => e.stopPropagation()}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-background px-2.5 py-2 text-right transition-colors hover:bg-slate-50"
            >
              {workspaceInfo}
              {workspaceLogoSquare}
              <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" />
            </button>
          </PopoverTrigger>
          <PopoverContent dir="rtl" align="end" side="bottom" sideOffset={6} className="w-72 p-1.5">
            <p className="px-2 py-1.5 text-[11px] font-semibold text-muted-foreground">
              {isSuperAdmin ? '\n' : 'מרחבי עבודה'}
            </p>
            {isSuperAdmin && (
              <div className="px-1.5 pb-1.5">
                <Input
                  dir="rtl"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="חיפוש לפי שם או אימייל"
                  className="h-8 text-xs"
                />
              </div>
            )}
            <div className="flex max-h-72 flex-col overflow-y-auto">
              {visibleWorkspaces.length === 0 && (
                <p className="px-2 py-3 text-xs text-muted-foreground">לא נמצאו חשבונות</p>
              )}
              {visibleWorkspaces.map((w) => {
                const label = resolveWorkspaceIdentity(w).name;
                const active = w.workspace_owner_id === activeWorkspaceId;
                return (
                  <button
                    key={w.workspace_owner_id}
                    type="button"
                    onClick={() => pick(w.workspace_owner_id, label)}
                    className={cn(
                      'flex items-center gap-2.5 rounded-md px-2 py-2 text-right text-sm transition-colors hover:bg-primary/10',
                      active && 'bg-primary/5 font-semibold text-primary',
                    )}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-background">
                      {w.workspace_logo_url || w.owner_avatar_url
                        ? <img src={w.workspace_logo_url ?? w.owner_avatar_url ?? undefined} alt={label} className={cn('h-full w-full', w.workspace_logo_url ? 'object-contain p-0.5' : 'object-cover')} />
                        : <Building2 className="h-3.5 w-3.5 text-primary" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      <span className="block truncate">{label}</span>
                      {isSuperAdmin && w.owner_email && (
                        <span dir="ltr" className="block truncate text-[10px] font-normal text-muted-foreground">
                          {w.owner_email}
                        </span>
                      )}
                    </span>
                    {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      ) : (
        <div
          onClick={(e) => e.stopPropagation()}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-background px-2.5 py-2 text-right"
        >
          {workspaceInfo}
          {workspaceLogoSquare}
        </div>
      )}
    </div>
  );
}

export default WorkspaceSwitcher;
