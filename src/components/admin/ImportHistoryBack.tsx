import { ArrowRight, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate } from '@/lib/router-compat';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/hooks/useWorkspace';
import { readReturn } from '@/lib/returnNav';

export function ImportHistoryBack() {
  const location = useLocation();
  const navigate = useNavigate();
  const { activeWorkspaceId, setActiveWorkspace } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const state = location.state as { importHistoryReturn?: boolean; previousWorkspaceId?: string } | null;
  const origin = readReturn(state);
  if (!state?.importHistoryReturn || !origin?.returnTo) return null;
  const back = async () => {
    setBusy(true);
    try {
      if (state.previousWorkspaceId && state.previousWorkspaceId !== activeWorkspaceId) await setActiveWorkspace(state.previousWorkspaceId);
      navigate(origin.returnTo!, { state: { restoreScroll: origin.returnScroll } });
    } finally { setBusy(false); }
  };
  return <Button variant="ghost" size="icon" className="shrink-0" aria-label="חזרה להיסטוריית היבוא" title="חזרה להיסטוריית היבוא" disabled={busy} onClick={() => void back()}>{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}</Button>;
}