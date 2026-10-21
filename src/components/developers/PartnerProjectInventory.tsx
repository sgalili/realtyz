import { useState } from 'react';
import { Megaphone, ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ResultTable } from '@/pages/Properties';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import ProjectHierarchyDetails from './ProjectHierarchyDetails';
import DeveloperCommissionBadges from './DeveloperCommissionBadges';
import type { PartnerProjectRecord } from '@/lib/partnerProjectInventory';

export default function PartnerProjectInventory({ records, grid }: { records: PartnerProjectRecord[]; grid: boolean }) {
  const [opened, setOpened] = useState<PartnerProjectRecord | null>(null);
  const navigate = useNavigate();
  const post = (record: PartnerProjectRecord) => navigate(`/campaigns?tab=create&listing=${encodeURIComponent(record.result.key)}&fresh=1`);
  if (!records.length) return null;
  return <>
    {grid ? <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{records.map(record => <Card key={record.result.key} className="overflow-hidden">
      <div className="aspect-[16/10] bg-muted">{record.result.photos?.[0] && <img src={record.result.photos[0]} alt={record.result.title} loading="lazy" className="h-full w-full object-cover" />}</div>
      <CardContent className="space-y-3 p-4"><h3 className="break-words font-semibold">{record.result.title}</h3><p className="text-sm text-muted-foreground">{[record.result.address, record.result.city].filter(Boolean).join(' · ')}</p>
        {record.result.price != null && <strong>₪{record.result.price.toLocaleString('he-IL')}</strong>}
        <DeveloperCommissionBadges project={record.project} unit={record.unit} />
        <div className="flex justify-between"><Button variant="ghost" onClick={() => setOpened(record)}><ChevronLeft className="h-4 w-4" />פרטים</Button><Button size="icon" variant="outline" aria-label="יצירת פוסט" title="יצירת פוסט" onClick={() => post(record)}><Megaphone className="h-4 w-4" /></Button></div>
      </CardContent></Card>)}</div> : <ResultTable results={records.map(record => ({ ...record.result, localId: undefined }))} importingKey={null} hideDefaultActions showPropertyNotes={false} propertyHref={() => null} propertyTitle={result => result.title}
      onSelect={result => setOpened(records.find(record => record.result.key === result.key) ?? null)}
      commissionCell={result => { const record = records.find(record => record.result.key === result.key); return record ? <DeveloperCommissionBadges project={record.project} unit={record.unit} /> : null; }}
      endActions={result => { const record = records.find(record => record.result.key === result.key); return record ? <Button size="icon" variant="outline" aria-label="יצירת פוסט" title="יצירת פוסט" onClick={event => { event.stopPropagation(); post(record); }}><Megaphone className="h-4 w-4" /></Button> : null; }} />}
    <Dialog open={!!opened} onOpenChange={open => { if (!open) setOpened(null); }}><DialogContent dir="rtl" className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{opened?.result.title}</DialogTitle></DialogHeader>{opened && <ProjectHierarchyDetails project={opened.project} onPost={unit => { const record = records.find(row => row.project.id === opened.project.id && row.unit?.source_unit_id === unit.source_unit_id && row.unit?.building_id === unit.building_id); if (record) post(record); }} />}</DialogContent></Dialog>
  </>;
}