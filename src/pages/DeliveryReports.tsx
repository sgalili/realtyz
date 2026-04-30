import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { KalpizLoader } from '@/components/KalpizLoader';
import { MessageSquare, Mail, Smartphone, Info, RefreshCw, CheckCircle2, XCircle, Clock, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

type Channel = 'sms' | 'whatsapp' | 'email' | 'voice';
type StatusFilter = 'all' | 'queued' | 'sent' | 'delivered' | 'failed';
type ChannelFilter = 'all' | Channel;

interface LogRow {
  id: string;
  campaign_name: string;
  channel: Channel;
  status: string;
  recipient_name: string | null;
  recipient_phone: string | null;
  recipient_email: string | null;
  message_body: string | null;
  source_account: string | null;
  provider_message_id: string | null;
  failure_reason: string | null;
  cost: number | null;
  sent_at: string | null;
  created_at: string;
}

const CHANNEL_META: Record<Channel, { label: string; icon: any; price: number; color: string }> = {
  sms:      { label: 'SMS',      icon: Smartphone,    price: 0.12, color: 'text-[#2563EB]' },
  whatsapp: { label: 'WhatsApp', icon: MessageSquare, price: 0.05, color: 'text-[#25D366]' },
  email:    { label: 'Email',    icon: Mail,          price: 0.02, color: 'text-[#EA4335]' },
  voice:    { label: 'Voice',    icon: MessageSquare, price: 0.30, color: 'text-muted-foreground' },
};

function StatusBadge({ status }: { status: string }) {
  if (status === 'sent' || status === 'delivered') {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/40 hover:bg-emerald-500/20">
        <CheckCircle2 className="h-3 w-3 ml-1" />
        {status === 'delivered' ? 'נמסר' : 'נשלח'}
      </Badge>
    );
  }
  if (status === 'failed') {
    return (
      <Badge className="bg-red-500/15 text-red-700 border-red-500/40 hover:bg-red-500/20">
        <XCircle className="h-3 w-3 ml-1" />
        נכשל
      </Badge>
    );
  }
  return (
    <Badge variant="outline">
      <Clock className="h-3 w-3 ml-1" />
      בתור
    </Badge>
  );
}

function formatTime(iso: string | null) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function dateFloor(daysAgo: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

const DeliveryReports = () => {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dateRange, setDateRange] = useState<'today' | '7d' | '30d' | 'all'>('7d');
  const [search, setSearch] = useState('');
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());

  const sinceIso = useMemo(() => {
    if (dateRange === 'all') return null;
    if (dateRange === 'today') return dateFloor(0);
    if (dateRange === '7d') return dateFloor(7);
    return dateFloor(30);
  }, [dateRange]);

  const { data: rows = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['delivery-reports', user?.id, sinceIso, channelFilter, statusFilter],
    queryFn: async (): Promise<LogRow[]> => {
      if (!user) return [];
      let q = supabase
        .from('campaign_logs')
        .select('id,campaign_name,channel,status,recipient_name,recipient_phone,recipient_email,message_body,source_account,provider_message_id,failure_reason,cost,sent_at,created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(500);
      if (sinceIso) q = q.gte('created_at', sinceIso);
      if (channelFilter !== 'all') q = q.eq('channel', channelFilter);
      if (statusFilter !== 'all') q = q.eq('status', statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as LogRow[];
    },
    enabled: !!user,
    refetchInterval: 15000,
  });

  // Realtime updates
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('delivery-reports-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_logs', filter: `user_id=eq.${user.id}` }, () => {
        qc.invalidateQueries({ queryKey: ['delivery-reports'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, qc]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const s = search.trim().toLowerCase();
    return rows.filter(r =>
      (r.recipient_name ?? '').toLowerCase().includes(s) ||
      (r.recipient_phone ?? '').toLowerCase().includes(s) ||
      (r.recipient_email ?? '').toLowerCase().includes(s) ||
      (r.campaign_name ?? '').toLowerCase().includes(s) ||
      (r.source_account ?? '').toLowerCase().includes(s),
    );
  }, [rows, search]);

  const summary = useMemo(() => {
    const totalSent = rows.filter(r => r.status === 'sent' || r.status === 'delivered').length;
    const totalFailed = rows.filter(r => r.status === 'failed').length;
    const totalAttempted = totalSent + totalFailed;
    const successRate = totalAttempted > 0 ? Math.round((totalSent / totalAttempted) * 100) : 0;
    const totalCost = rows.reduce((s, r) => {
      if (r.status !== 'sent' && r.status !== 'delivered') return s;
      const price = r.cost ?? CHANNEL_META[r.channel]?.price ?? 0;
      return s + Number(price);
    }, 0);
    const providers = Array.from(new Set(rows.map(r => r.source_account).filter((x): x is string => !!x)));
    return { totalSent, totalFailed, successRate, totalCost, providers };
  }, [rows]);

  const handleRetry = async (row: LogRow) => {
    if (!user) return;
    setRetryingIds(prev => new Set(prev).add(row.id));
    try {
      // Re-queue this row by resetting status; dispatch picks up `queued` rows by campaign_name.
      const { error: upErr } = await supabase
        .from('campaign_logs')
        .update({ status: 'queued', failure_reason: null, sent_at: null })
        .eq('id', row.id);
      if (upErr) throw upErr;
      const { data, error } = await supabase.functions.invoke('dispatch-campaign', {
        body: { mode: 'campaign', campaign_name: row.campaign_name, limit: 50 },
      });
      if (error) throw error;
      const succeeded = (data as any)?.succeeded ?? 0;
      toast.success(succeeded > 0 ? 'נשלח מחדש בהצלחה' : 'נשלח לעיבוד');
      await refetch();
    } catch (e: any) {
      toast.error(`שליחה חוזרת נכשלה: ${e?.message ?? e}`);
    } finally {
      setRetryingIds(prev => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
    }
  };

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-primary">דו"חות מסירה</h2>
          <p className="text-sm text-muted-foreground mt-0.5">מעקב בזמן אמת על כל הודעה שנשלחה ומה היה החשבון השולח</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 ml-2 ${isFetching ? 'animate-spin' : ''}`} />
          רענן
        </Button>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">סה"כ נשלחו</div>
          <div className="text-2xl font-bold mt-1">{summary.totalSent.toLocaleString('he-IL')}</div>
          {summary.totalFailed > 0 && (
            <div className="text-[11px] text-red-600 mt-0.5">{summary.totalFailed} נכשלו</div>
          )}
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">אחוז הצלחה</div>
          <div className="text-2xl font-bold mt-1">{summary.successRate}%</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">עלות כוללת</div>
          <div className="text-2xl font-bold mt-1">₪{summary.totalCost.toFixed(2)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">חשבונות פעילים</div>
          <div className="text-sm font-medium mt-1 line-clamp-2 leading-tight">
            {summary.providers.length === 0 ? '—' : summary.providers.slice(0, 3).join(' · ')}
            {summary.providers.length > 3 && ` +${summary.providers.length - 3}`}
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="חיפוש לפי שם/טלפון/אימייל/קמפיין"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as any)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">היום</SelectItem>
              <SelectItem value="7d">7 ימים</SelectItem>
              <SelectItem value="30d">30 ימים</SelectItem>
              <SelectItem value="all">הכל</SelectItem>
            </SelectContent>
          </Select>
          <Select value={channelFilter} onValueChange={(v) => setChannelFilter(v as ChannelFilter)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל הערוצים</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="email">Email</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל הסטטוסים</SelectItem>
              <SelectItem value="sent">נשלח</SelectItem>
              <SelectItem value="delivered">נמסר</SelectItem>
              <SelectItem value="failed">נכשל</SelectItem>
              <SelectItem value="queued">בתור</SelectItem>
            </SelectContent>
          </Select>
          <div className="text-xs text-muted-foreground mr-auto">
            מציג {filtered.length} מתוך {rows.length}
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="py-16 flex justify-center"><KalpizLoader size="md" label="טוען נתונים..." /></div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground text-sm">
            לא נמצאו רשומות. הפעל קמפיין כדי לראות נתוני מסירה כאן.
          </div>
        ) : (
          <TooltipProvider>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">נמען</TableHead>
                  <TableHead className="text-right">ערוץ</TableHead>
                  <TableHead className="text-right">חשבון מקור</TableHead>
                  <TableHead className="text-right">קמפיין</TableHead>
                  <TableHead className="text-right">סטטוס</TableHead>
                  <TableHead className="text-right">זמן</TableHead>
                  <TableHead className="text-right w-[80px]">פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => {
                  const meta = CHANNEL_META[row.channel] ?? CHANNEL_META.sms;
                  const Icon = meta.icon;
                  const price = row.cost ?? meta.price;
                  const contact = row.recipient_phone ?? row.recipient_email ?? '-';
                  const isRetrying = retryingIds.has(row.id);
                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium text-sm">{row.recipient_name ?? 'ללא שם'}</div>
                        <div className="text-xs text-muted-foreground" dir="ltr">{contact}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Icon className={`h-4 w-4 ${meta.color}`} />
                          <div>
                            <div className="text-sm font-medium">{meta.label}</div>
                            <div className="text-[11px] text-muted-foreground">₪{Number(price).toFixed(2)}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs font-mono text-foreground/80 max-w-[220px] truncate" dir="ltr">
                          {row.source_account ?? <span className="text-muted-foreground">—</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm max-w-[180px] truncate">{row.campaign_name}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <StatusBadge status={row.status} />
                          {row.status === 'failed' && row.failure_reason && (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className="text-red-600 hover:text-red-700">
                                  <Info className="h-4 w-4" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent side="top" className="w-72 text-xs" dir="rtl">
                                <div className="flex items-start gap-2">
                                  <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                                  <div>
                                    <div className="font-semibold mb-1">שגיאת ספק</div>
                                    <div className="text-muted-foreground break-words">{row.failure_reason}</div>
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-xs text-muted-foreground" dir="ltr">
                              {formatTime(row.sent_at ?? row.created_at)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="text-xs">נוצר: {formatTime(row.created_at)}</div>
                            {row.sent_at && <div className="text-xs">נשלח: {formatTime(row.sent_at)}</div>}
                            {row.provider_message_id && <div className="text-xs" dir="ltr">ID: {row.provider_message_id}</div>}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        {row.status === 'failed' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRetry(row)}
                            disabled={isRetrying}
                          >
                            <RefreshCw className={`h-3 w-3 ml-1 ${isRetrying ? 'animate-spin' : ''}`} />
                            נסה שוב
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TooltipProvider>
        )}
      </Card>
    </div>
  );
};

export default DeliveryReports;
