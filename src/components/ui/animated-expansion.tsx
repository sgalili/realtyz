import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function AnimatedExpansion({ open, children, className, id }: { open: boolean; children: ReactNode; className?: string; id?: string }) {
  const reduced = useReducedMotion();
  return <AnimatePresence initial={false}>
    {open && <motion.div id={id} key="content" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: reduced ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }} className={cn('min-w-0 overflow-hidden', className)}>
      {children}
    </motion.div>}
  </AnimatePresence>;
}