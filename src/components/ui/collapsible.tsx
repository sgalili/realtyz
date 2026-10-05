import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";
import * as React from 'react';
import { cn } from '@/lib/utils';
import { useExclusiveExpansion } from '@/hooks/useExclusiveExpansion';

const PeerContext = React.createContext('collapsible-root');
const Collapsible = React.forwardRef<React.ElementRef<typeof CollapsiblePrimitive.Root>, React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Root>>(({ open, defaultOpen, onOpenChange, children, ...props }, ref) => {
  const group = React.useContext(PeerContext);
  const id = React.useId();
  const [expanded, setExpanded] = useExclusiveExpansion(group, id);
  const previous = React.useRef(open);
  React.useEffect(() => { if (open === true || (open === undefined && defaultOpen)) setExpanded(true); }, []);
  React.useEffect(() => {
    if (open !== previous.current && open !== undefined) setExpanded(open);
    previous.current = open;
  }, [open, setExpanded]);
  React.useEffect(() => { if (open === true && !expanded) onOpenChange?.(false); }, [expanded]);
  return <CollapsiblePrimitive.Root {...props} ref={ref} open={expanded} onOpenChange={(next) => { setExpanded(next); onOpenChange?.(next); }}><PeerContext.Provider value={`collapsible:${id}`}>{children}</PeerContext.Provider></CollapsiblePrimitive.Root>;
});
Collapsible.displayName = 'Collapsible';

const CollapsibleTrigger = CollapsiblePrimitive.CollapsibleTrigger;

const CollapsibleContent = React.forwardRef<React.ElementRef<typeof CollapsiblePrimitive.Content>, React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Content>>(({ className, ...props }, ref) => <CollapsiblePrimitive.Content ref={ref} {...props} className={cn('overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up motion-reduce:animate-none', className)} />);
CollapsibleContent.displayName = 'CollapsibleContent';

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
