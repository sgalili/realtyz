import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Image as ImageIcon, Video as VideoIcon, FileAudio, FileText, Files,
  Copy, Trash2, Upload, Loader2, Search,
} from "lucide-react";
import { toast } from "sonner";
import { uploadMediaToLibrary, detectMediaKind, type MediaKind } from "@/lib/mediaUpload";

interface MediaRow {
  id: string;
  file_name: string;
  storage_path: string;
  public_url: string;
  mime_type: string | null;
  size_bytes: number | null;
  media_kind: MediaKind;
  source: string | null;
  created_at: string;
}

const KIND_ICON: Record<MediaKind, React.ComponentType<{ className?: string }>> = {
  image: ImageIcon,
  video: VideoIcon,
  audio: FileAudio,
  document: FileText,
  other: Files,
};

export function MediaLibraryPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<"all" | MediaKind>("all");
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["media-library", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_library")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as MediaRow[];
    },
  });

  const filtered = useMemo(() => {
    return items.filter((m) => {
      if (filter !== "all" && m.media_kind !== filter) return false;
      if (search && !m.file_name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [items, filter, search]);

  const del = useMutation({
    mutationFn: async (m: MediaRow) => {
      await supabase.storage.from("media-library").remove([m.storage_path]);
      const { error } = await supabase.from("media_library").delete().eq("id", m.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["media-library"] });
      toast.success("הקובץ נמחק");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleUpload = async (files: FileList | File[]) => {
    if (!user?.id) return;
    setUploading(true);
    let ok = 0;
    for (const f of Array.from(files)) {
      try {
        await uploadMediaToLibrary({
          userId: user.id,
          fileName: f.name,
          data: f,
          mimeType: f.type,
          source: "manual_upload",
        });
        ok += 1;
      } catch (e) {
        toast.error(`שגיאה בהעלאת ${f.name}: ${(e as Error).message}`);
      }
    }
    setUploading(false);
    if (ok > 0) {
      qc.invalidateQueries({ queryKey: ["media-library"] });
      toast.success(`הועלו ${ok} קבצים`);
    }
  };

  const copyUrl = async (url: string) => {
    await navigator.clipboard.writeText(url);
    toast.success("הקישור הועתק ללוח");
  };

  return (
    <Card dir="rtl">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-primary" />
              ספריית מדיה
            </CardTitle>
            <CardDescription>
              קבצי מדיה זמינים לשימוש בפוסטים, קמפיינים והודעות ישירות.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handleUpload(e.target.files);
                e.target.value = "";
              }}
            />
            <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploading} className="gap-1">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              העלה
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)} dir="rtl">
            <TabsList>
              <TabsTrigger value="all">הכל</TabsTrigger>
              <TabsTrigger value="image">תמונות</TabsTrigger>
              <TabsTrigger value="video">וידאו</TabsTrigger>
              <TabsTrigger value="audio">אודיו</TabsTrigger>
              <TabsTrigger value="document">מסמכים</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש לפי שם קובץ..."
              className="pr-7 h-8 text-sm"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> טוען...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-10">
            אין קבצים להצגה. העלו ייצוא WhatsApp עם מדיה או קבצים בודדים.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {filtered.map((m) => {
              const Icon = KIND_ICON[m.media_kind] ?? Files;
              return (
                <div key={m.id} className="group relative rounded-md border bg-muted/20 overflow-hidden">
                  <div className="aspect-square w-full bg-muted/40 flex items-center justify-center overflow-hidden">
                    {m.media_kind === "image" ? (
                      <img src={m.public_url} alt={m.file_name} className="w-full h-full object-cover" loading="lazy" />
                    ) : m.media_kind === "video" ? (
                      <video src={m.public_url} className="w-full h-full object-cover" muted />
                    ) : (
                      <Icon className="h-10 w-10 text-muted-foreground" />
                    )}
                  </div>
                  <div className="p-2 space-y-1">
                    <div className="text-[11px] font-medium truncate" title={m.file_name}>{m.file_name}</div>
                    <div className="flex items-center justify-between gap-1">
                      <Badge variant="outline" className="text-[9px] px-1 py-0">{m.media_kind}</Badge>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copyUrl(m.public_url)} title="העתק קישור">
                          <Copy className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-destructive"
                          onClick={() => {
                            if (confirm(`למחוק את ${m.file_name}?`)) del.mutate(m);
                          }}
                          title="מחק"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default MediaLibraryPanel;
