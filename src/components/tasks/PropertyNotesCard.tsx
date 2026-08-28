/**
 * Aggregated property notes for the Today's Tasks page.
 * Shows every note attached to a property in FULL, with edit and delete.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Building2, ChevronLeft, Pencil, StickyNote, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  deletePropertyNote,
  propertyNoteKindLabel,
  updatePropertyNote,
  usePropertyNotes,
  type PropertyNote,
} from '@/hooks/usePropertyNotes';

export function PropertyNotesCard() {
  const { data: notes = [], isLoading } = usePropertyNotes();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<PropertyNote | null>(null);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setText(editing?.content ?? '');
  }, [editing]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['property-notes'] });

  const remove = async (note: PropertyNote) => {
    try {
      await deletePropertyNote(note);
      toast.success('ההערה נמחקה');
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? 'מחיקת ההערה נכשלה');
    }
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await updatePropertyNote(editing, text);
      toast.success('ההערה עודכנה');
      refresh();
      setEditing(null);
    } catch (e: any) {
      toast.error(e?.message ?? 'עדכון ההערה נכשל');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card dir="rtl" className="p-4">
      <div className="mb-4 flex items-center gap-2">
        <StickyNote className="h-5 w-5 text-amber-600" />
        <h2 className="text-lg font-semibold">הערות על נכסים</h2>
        {notes.length > 0 && <Badge variant="secondary" className="text-[13px]">{notes.length}</Badge>}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : notes.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">אין הערות על נכסים.</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-lg border border-border bg-card p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <Link
                    to={`/properties/${n.listingId}`}
                    className="inline-flex items-center gap-1 text-base font-semibold hover:underline"
                  >
                    <Building2 className="h-4 w-4 opacity-60" />
                    {n.listingLabel ?? 'נכס'}
                    <ChevronLeft className="h-4 w-4" />
                  </Link>
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
                    <span className="font-bold">{propertyNoteKindLabel(n.kind)}: </span>
                    {n.content}
                  </p>
                  {n.createdAt && (
                    <p className="text-[13px] text-muted-foreground">
                      {new Date(n.createdAt).toLocaleString('he-IL', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="h-9 gap-1 text-sm" onClick={() => setEditing(n)}>
                    <Pencil className="h-4 w-4" />
                    עריכה
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 gap-1 text-sm text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => remove(n)}
                  >
                    <Trash2 className="h-4 w-4" />
                    מחק
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!editing} onOpenChange={(v) => { if (!v) setEditing(null); }}>
        <DialogContent dir="rtl" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>עריכת הערה על נכס</DialogTitle>
          </DialogHeader>
          <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditing(null)}>ביטול</Button>
            <Button onClick={save} disabled={saving}>שמירה</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
