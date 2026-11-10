import { useEffect, useState } from 'react';
import { useWorkspace } from '@/hooks/useWorkspace';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { subscribeInactiveImports, type InactiveImportRequest } from '@/lib/yad2Preflight';

export function InactiveYad2ImportDialog() {
  const { activeWorkspaceId } = useWorkspace();
  const [requests, setRequests] = useState<InactiveImportRequest[]>([]);
  useEffect(() => subscribeInactiveImports(request => setRequests(current => [...current, request])), []);
  useEffect(() => () => setRequests(current => { current.forEach(request => request.resolve('skip')); return []; }), [activeWorkspaceId]);
  const choose = (choice: 'draft' | 'skip') => {
    requests[0]?.resolve(choice);
    setRequests(current => current.slice(1));
  };
  return <Dialog open={requests.length > 0} onOpenChange={open => { if (!open) choose('skip'); }}>
    <DialogContent dir="rtl" className="sm:max-w-lg">
      <DialogHeader><DialogTitle className="text-right">מודעה לא פעילה ביד 2</DialogTitle><DialogDescription className="text-right leading-relaxed">שים לב: מודעה זו אינה פעילה עוד ביד 2 (ככל הנראה הוסרה או נמכרה). האם ברצונך ליצור אותה כטיוטה פנימית להשלמה ידנית של הנתונים, או לדלג עליה?</DialogDescription></DialogHeader>
      <div className="flex items-center justify-between gap-3"><Button variant="outline" onClick={() => choose('skip')}>דלג על המודעה</Button><Button onClick={() => choose('draft')}>יצירת טיוטה פנימית</Button></div>
    </DialogContent>
  </Dialog>;
}