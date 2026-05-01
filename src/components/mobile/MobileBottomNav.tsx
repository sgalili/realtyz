import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Briefcase, BookOpen, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { QuickCaptureSheet } from './QuickCaptureSheet';

/**
 * Persistent mobile bottom navigation bar.
 * Visible only on viewports < md (Tailwind). Hidden on tablets/desktops.
 * Provides one-tap access to Deal Room, Strategy Bank, and Quick Capture.
 */
export function MobileBottomNav() {
  const location = useLocation();
  const [captureOpen, setCaptureOpen] = useState(false);

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

  const itemClass = (active: boolean) =>
    cn(
      'flex h-14 min-w-[64px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-[11px] font-medium transition-colors',
      active
        ? 'text-primary'
        : 'text-muted-foreground hover:text-foreground'
    );

  return (
    <>
      <nav
        dir="rtl"
        aria-label="ניווט תחתון"
        className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-md shadow-[0_-4px_20px_-8px_rgba(0,0,0,0.15)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="mx-auto flex max-w-xl items-center justify-between gap-1 px-3 py-1.5">
          <Link to="/deal-room" className={itemClass(isActive('/deal-room'))} aria-label="עסקאות">
            <Briefcase className="h-6 w-6" />
            <span>עסקאות</span>
          </Link>

          <button
            type="button"
            onClick={() => setCaptureOpen(true)}
            aria-label="לכידה מהירה"
            className="relative -mt-6 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95"
          >
            <Plus className="h-7 w-7" />
          </button>

          <Link to="/knowledge" className={itemClass(isActive('/knowledge'))} aria-label="מאגר הידע">
            <BookOpen className="h-6 w-6" />
            <span>מאגר הידע</span>
          </Link>
        </div>
      </nav>

      <QuickCaptureSheet open={captureOpen} onOpenChange={setCaptureOpen} />
    </>
  );
}
