import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Cloud, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
}

interface Props {
  onFileFetched: (file: File) => void;
}

/**
 * Lists CSV / XLSX files from the connected Google Drive (BYOK OAuth on
 * /social-connect) and lets the user pick one. The file is downloaded
 * client-side using the saved access_token, then handed off to the regular
 * MassiveImporter parsing pipeline.
 */
export function DriveImporterPicker({ onFileFetched }: Props) {
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<DriveFile[] | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const loadToken = async () => {
    const { data } = await supabase
      .from('social_connections')
      .select('credentials, is_connected, encrypted_session')
      .eq('platform', 'google_drive')
      .maybeSingle();
    const creds = (data?.credentials as any) ?? {};
    const accessToken = creds?.manual?.access_token as string | undefined;
    if (!data?.is_connected || !data?.encrypted_session || !accessToken) {
      setToken(null);
      return null;
    }
    setToken(accessToken);
    return accessToken;
  };

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const accessToken = token ?? (await loadToken());
      if (!accessToken) {
        toast.error('Google Drive לא מחובר', {
          description: 'התחבר בדף Social Connect כדי לייבא מהדרייב',
        });
        return;
      }
      const q = encodeURIComponent(
        "(mimeType='text/csv' or mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' or mimeType='application/vnd.ms-excel' or mimeType='application/vnd.google-apps.spreadsheet') and trashed=false",
      );
      const url = `https://www.googleapis.com/drive/v3/files?pageSize=50&orderBy=modifiedTime%20desc&q=${q}&fields=files(id,name,mimeType,modifiedTime,size)`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error('שליפת קבצים נכשלה', { description: json.error?.message ?? `HTTP ${res.status}` });
        return;
      }
      setFiles(json.files ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadToken();
  }, []);

  const downloadFile = async (f: DriveFile) => {
    if (!token) return;
    setDownloadingId(f.id);
    try {
      // Native Sheets need export; binary files use alt=media.
      const isGoogleSheet = f.mimeType === 'application/vnd.google-apps.spreadsheet';
      const url = isGoogleSheet
        ? `https://www.googleapis.com/drive/v3/files/${f.id}/export?mimeType=text/csv`
        : `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        toast.error('הורדת הקובץ נכשלה', { description: `HTTP ${res.status}` });
        return;
      }
      const blob = await res.blob();
      const filename = isGoogleSheet ? `${f.name}.csv` : f.name;
      const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
      onFileFetched(file);
      toast.success('הקובץ הוטען מ־Google Drive');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <Card className="border-primary/20" dir="rtl">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Cloud className="h-5 w-5 text-primary" />
          ייבוא מ־Google Drive
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!token ? (
          <p className="text-sm text-muted-foreground">
            לא נמצא חיבור Google Drive פעיל. התחבר בדף Social Connect ואז חזור לכאן.
          </p>
        ) : (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={fetchFiles} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <RefreshCw className="h-4 w-4 ml-1" />}
              {files === null ? 'טען רשימת קבצים' : 'רענן רשימה'}
            </Button>
            {files && (
              <span className="text-xs text-muted-foreground">{files.length} קבצים זמינים</span>
            )}
          </div>
        )}

        {files && files.length > 0 && (
          <div className="border border-border rounded-md max-h-64 overflow-y-auto divide-y divide-border">
            {files.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-muted/40">
                <div className="flex items-center gap-2 min-w-0">
                  <FileSpreadsheet className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm truncate">{f.name}</span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={downloadingId === f.id}
                  onClick={() => downloadFile(f)}
                >
                  {downloadingId === f.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'ייבא'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
