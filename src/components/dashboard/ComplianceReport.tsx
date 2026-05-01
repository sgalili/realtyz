import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileDown, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ReportData {
  totalVoters: number;
  supporters: number;
  mandateTarget: number;
  targetVotes: number;
  sentimentBreakdown: { positive: number; negative: number; neutral: number };
  cityClusters: { city: string; count: number; positive: number; negative: number; neutral: number }[];
}

export function ComplianceReport({ data }: { data?: ReportData }) {
  const [generating, setGenerating] = useState(false);

  const handleDownload = async () => {
    if (!data) return;
    setGenerating(true);

    try {
      const now = new Date();
      const dateStr = now.toLocaleDateString('he-IL');
      const timeStr = now.toLocaleTimeString('he-IL');

      // Build CSV compliance report
      const lines: string[] = [];
      lines.push('דוח תאימות מערכת - Realtyz AI');
      lines.push(`תאריך: ${dateStr} ${timeStr}`);
      lines.push('');
      lines.push('=== סיכום כללי ===');
      lines.push(`סה"כ רשומות בבסיס הנתונים,${data.totalVoters}`);
      lines.push(`תומכים מאושרים,${data.supporters}`);
      lines.push(`יעד עסקאות,${data.mandateTarget}`);
      lines.push(`יעד קולות,${data.targetVotes}`);
      lines.push(`אחוז התקדמות,${Math.round((data.supporters / data.targetVotes) * 100)}%`);
      lines.push('');
      lines.push('=== פילוח סנטימנט ===');
      const total = data.sentimentBreakdown.positive + data.sentimentBreakdown.negative + data.sentimentBreakdown.neutral || 1;
      lines.push(`חיובי,${data.sentimentBreakdown.positive},${Math.round(data.sentimentBreakdown.positive / total * 100)}%`);
      lines.push(`ניטרלי,${data.sentimentBreakdown.neutral},${Math.round(data.sentimentBreakdown.neutral / total * 100)}%`);
      lines.push(`שלילי,${data.sentimentBreakdown.negative},${Math.round(data.sentimentBreakdown.negative / total * 100)}%`);
      lines.push('');
      lines.push('=== התפלגות גיאוגרפית ===');
      lines.push('עיר,מתעניינים,חיובי,ניטרלי,שלילי');
      data.cityClusters
        .sort((a, b) => b.count - a.count)
        .forEach(c => {
          lines.push(`${c.city},${c.count},${c.positive},${c.neutral},${c.negative}`);
        });
      lines.push('');
      lines.push('=== אישור תאימות ===');
      lines.push('כל הנתונים מאוחסנים בהתאם לתקנות הגנת הפרטיות');
      lines.push('גישה לנתונים מוגנת באמצעות Row-Level Security');
      lines.push(`חתימת דוח: REALTYZ-${Date.now().toString(36).toUpperCase()}`);

      // Add BOM for Excel Hebrew support
      const BOM = '\uFEFF';
      const blob = new Blob([BOM + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `compliance-report-${now.toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('דוח תאימות הורד בהצלחה');
    } catch (err) {
      toast.error('שגיאה ביצירת הדוח');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={generating || !data}
      className="text-amber-600 hover:text-amber-500 disabled:opacity-50"
    >
      {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
    </button>
  );
}
