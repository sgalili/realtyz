import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Download, Share2, Sparkles, Target, ListChecks, AlertTriangle, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

export interface StrategyBrief {
  headline: string;
  thesis: string;
  pillars: string[];
  next_actions: string[];
  risks: string[];
  signature_message: string;
}

export interface StrategyStats {
  targetVoters: number;
  projectedHot: number;
  projectedCold: number;
  gap: number;
  mandate_target: number;
  months_to_election: number;
}

export function StrategyBriefCard({
  brief, stats, candidate,
}: { brief: StrategyBrief; stats: StrategyStats; candidate: string }) {
  const ref = useRef<HTMLDivElement>(null);

  const handleDownload = () => {
    const text = `📋 ה-Brief האסטרטגי של ${candidate}
═══════════════════════════════

🎯 ${brief.headline}

תזה: ${brief.thesis}

📊 נתונים:
• יעד עסקאות: ${stats.mandate_target}
• מתעניינים נדרשים: ${stats.targetVoters.toLocaleString()}
• פער: ${stats.gap.toLocaleString()}
• זמן למכירות: ${stats.months_to_election} חודשים

🏛 עמודי תווך:
${brief.pillars.map((p, i) => `${i + 1}. ${p}`).join('\n')}

✅ פעולות מיידיות:
${brief.next_actions.map((a, i) => `${i + 1}. ${a}`).join('\n')}

⚠️ סיכונים:
${brief.risks.map((r, i) => `${i + 1}. ${r}`).join('\n')}

💬 הודעת חתימה:
${brief.signature_message}

---
נוצר ב-Realtyz AI · ${new Date().toLocaleDateString('he-IL')}
`;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Strategy-Brief-${candidate.replace(/\s+/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('הורדנו את ה-Brief בהצלחה');
  };

  const handleShare = async () => {
    const summary = `${brief.headline}\n\n${brief.thesis}\n\nנוצר ב-Realtyz AI`;
    if (navigator.share) {
      try { await navigator.share({ title: `Brief אסטרטגי - ${candidate}`, text: summary }); } catch {}
    } else {
      await navigator.clipboard.writeText(summary);
      toast.success('הועתק ללוח');
    }
  };

  return (
    <div className="space-y-3">
      <Card ref={ref} className="overflow-hidden border-primary/30 bg-gradient-to-br from-primary/5 via-background to-background" dir="rtl">
        {/* Header */}
        <div className="p-5 border-b bg-primary/8">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-primary font-bold">
            <Sparkles className="h-3 w-3" /> Listing Outreach Strategy Brief
          </div>
          <h2 className="text-xl font-black mt-1.5 leading-tight">{brief.headline}</h2>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{brief.thesis}</p>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-3 border-b text-center">
          <Stat label="יעד עסקאות" value={stats.mandate_target.toString()} />
          <Stat label="מתעניינים נדרשים" value={stats.targetVoters.toLocaleString()} divider />
          <Stat label="פער ליעד" value={stats.gap.toLocaleString()} />
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <Section icon={Target} title="עמודי תווך אסטרטגיים" items={brief.pillars} accent="text-primary" />
          <Section icon={ListChecks} title="פעולות 30 יום" items={brief.next_actions} accent="text-emerald-600" />
          <Section icon={AlertTriangle} title="סיכונים לנטר" items={brief.risks} accent="text-amber-600" />

          <div className="pt-3 border-t">
            <div className={`flex items-center gap-1.5 text-xs font-bold mb-2 text-blue-600`}>
              <MessageSquare className="h-3.5 w-3.5" /> הודעת חתימה למתעניינים חמים
            </div>
            <p className="text-sm leading-relaxed bg-muted/40 rounded-lg p-3 italic">
              "{brief.signature_message}"
            </p>
          </div>
        </div>

        <div className="px-5 py-2.5 border-t bg-muted/20 text-[10px] text-muted-foreground text-center">
          נוצר ב-Realtyz AI · {new Date().toLocaleDateString('he-IL')}
        </div>
      </Card>

      <div className="flex gap-2">
        <Button onClick={handleDownload} variant="outline" className="flex-1 gap-2">
          <Download className="h-4 w-4" /> הורד
        </Button>
        <Button onClick={handleShare} variant="outline" className="flex-1 gap-2">
          <Share2 className="h-4 w-4" /> שתף
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value, divider }: { label: string; value: string; divider?: boolean }) {
  return (
    <div className={`py-3 ${divider ? 'border-x' : ''}`}>
      <p className="text-base font-black tabular-nums">{value}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function Section({ icon: Icon, title, items, accent }: { icon: any; title: string; items: string[]; accent: string }) {
  return (
    <div>
      <div className={`flex items-center gap-1.5 text-xs font-bold mb-2 ${accent}`}>
        <Icon className="h-3.5 w-3.5" /> {title}
      </div>
      <ul className="space-y-1.5">
        {(items ?? []).map((item, i) => (
          <li key={i} className="text-sm leading-relaxed flex gap-2">
            <span className={`${accent} font-bold shrink-0`}>{i + 1}.</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
