import { Copy, ExternalLink, Loader2, Mail, MessageSquare, MoreHorizontal, Pencil, RefreshCw, Repeat2, Share2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { BrandIcon } from '@/components/BrandIcon';
import { openWhatsAppContactPicker } from '@/lib/officialWa';
import { toast } from 'sonner';

export function PostActionsMenu({ postUrl, onRefresh, onEdit, onRepost, onDelete, refreshing = false, refreshDisabled = false, reposting = false }: {
  postUrl?: string | null;
  onRefresh?: () => void;
  onEdit?: () => void;
  onRepost?: () => void;
  onDelete?: () => void;
  refreshing?: boolean;
  refreshDisabled?: boolean;
  reposting?: boolean;
}) {
  const openPost = () => { if (postUrl) window.open(postUrl, '_blank', 'noopener,noreferrer'); };
  const copyUrl = async () => {
    if (!postUrl) return;
    try { await navigator.clipboard.writeText(postUrl); toast.success('קישור הקמפיין הועתק'); }
    catch { toast.error('לא ניתן להעתיק את הקישור'); }
  };
  return (
    <div className="shrink-0" onClick={(event) => event.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="פעולות קמפיין" title="פעולות קמפיין">
            <MoreHorizontal className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56" onClick={(event) => event.stopPropagation()}>
          <DropdownMenuItem disabled={!onRefresh || refreshing || refreshDisabled} onSelect={onRefresh} className="gap-2">
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} רענון הקמפיין
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!onEdit} onSelect={onEdit} className="gap-2"><Pencil className="h-4 w-4" /> עריכת הקמפיין</DropdownMenuItem>
          <DropdownMenuItem disabled={!postUrl} onSelect={openPost} className="gap-2"><ExternalLink className="h-4 w-4" /> צפייה בקמפיין בחלון חדש</DropdownMenuItem>
          <DropdownMenuItem disabled={!onRepost || reposting} onSelect={onRepost} className="gap-2"><Repeat2 className="h-4 w-4" /> פרסום מחדש</DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={!postUrl} className="gap-2"><Share2 className="h-4 w-4" /> שיתוף הקמפיין</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem className="gap-2" onSelect={() => { if (postUrl) openWhatsAppContactPicker(postUrl); }}><BrandIcon name="whatsapp" className="h-4 w-4" /> WhatsApp</DropdownMenuItem>
              <DropdownMenuItem className="gap-2" onSelect={() => { if (postUrl) window.location.href = `sms:?body=${encodeURIComponent(postUrl)}`; }}><MessageSquare className="h-4 w-4" /> SMS</DropdownMenuItem>
              <DropdownMenuItem className="gap-2" onSelect={() => { if (postUrl) window.location.href = `mailto:?body=${encodeURIComponent(postUrl)}`; }}><Mail className="h-4 w-4" /> דוא״ל</DropdownMenuItem>
              <DropdownMenuItem className="gap-2" onSelect={() => { void copyUrl(); }}><Copy className="h-4 w-4" /> העתקת קישור</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!onDelete} onSelect={onDelete} className="gap-2 text-destructive focus:text-destructive"><Trash2 className="h-4 w-4" /> מחיקת הקמפיין</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}