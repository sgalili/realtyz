import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Building2 } from 'lucide-react';
import ProjectTimelineBar from './ProjectTimelineBar';
import DeveloperCommissionBadges from './DeveloperCommissionBadges';
import { Button } from '@/components/ui/button';
import { projectCommissionErrors } from '@/lib/developerCommissions';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import PropertyGallerySlider from '@/components/public/PropertyGallerySlider';
import { savedProjectHierarchy } from '@/lib/developerProjectBoard';
import { sourceRecord, type ProjectUnit } from '../../../supabase/functions/_shared/projectHierarchy';
import type { DeveloperProject } from '@/lib/developerProjectForm';
import StandardPropertyCard from '@/components/public/StandardPropertyCard';
import type { PublicCard } from '@/pages/PublicListingsBoard';

const labelValue = (value: unknown): string => {
  if (value == null) return '';
  if (typeof value === 'boolean') return value ? 'כן' : 'לא';
  if (Array.isArray(value)) return value.map(labelValue).filter(Boolean).join(' · ');
  if (typeof value === 'object') { const row = sourceRecord(value); return labelValue(row.text ?? row.name ?? row.label ?? row.title ?? row.milestone ?? row.value); }
  return String(value);
};
const timelineLabel = (value: unknown) => {
  const row = sourceRecord(value);
  return [labelValue(row.label ?? row.title ?? row.name ?? row.text), labelValue(row.date), labelValue(row.status)].filter(Boolean).join(' · ');
};
const unitTitle = (unit: ProjectUnit) => [labelValue(unit.type), unit.rooms != null ? `${unit.rooms} חדרים` : '', unit.size_sqm != null ? `${unit.size_sqm} מ״ר` : '', unit.floor != null ? `קומה ${unit.floor}` : ''].filter(Boolean).join(' · ') || `יחידה ${unit.source_unit_id}`;
const unitCard = (unit: ProjectUnit, project: DeveloperProject): PublicCard => {
  const floor = unit.floor != null && /^-?\d+$/.test(String(unit.floor)) ? Number(unit.floor) : null;
  return { id: `${project.id}:${unit.building_id ?? ''}:${unit.source_unit_id}`, slug: null, title: [project.name, unitTitle(unit)].filter(Boolean).join(' · '), city: (project as { city?: string | null }).city ?? null, neighborhood: null, street: project.address ?? '', deal_type: 'sale', rooms: unit.rooms, sqm: unit.size_sqm, floor, total_floors: null, price: unit.price, description: labelValue(unit.description) || null, photos: unit.images ?? [], contact_options: null, property_type: labelValue(unit.type) || null };
};
function UnitDetails({ units, project, onPublish, onPost }: { units: ProjectUnit[]; project: DeveloperProject; onPublish?: (unit: ProjectUnit) => void; onPost?: (unit: ProjectUnit) => void }) {
  const [opened, setOpened] = useState<ProjectUnit | null>(null);
  const extra = opened ? Object.entries(sourceRecord(opened.source_details)).filter(([key, value]) => !['url', 'specifications'].includes(key) && labelValue(value) && labelValue(value).length < 400) : [];
  // Same card and grid as the homepage board, so project apartments look exactly like board properties.
  return <div className="min-w-0">
    <div className="property-card-grid">
    {units.map(unit => <StandardPropertyCard key={`${unit.building_id}:${unit.source_unit_id}`} card={unitCard(unit, project)} onOpen={() => setOpened(unit)} onFavorite={() => undefined} showContact={false} showOwnerMenu={false} menu={<span />} />)}
    </div>
    <Dialog open={!!opened} onOpenChange={open => { if (!open) setOpened(null); }}>
      <DialogContent dir="rtl" className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{opened ? unitTitle(opened) : ''}</DialogTitle></DialogHeader>
        {opened && <div className="space-y-4">
          {opened.price != null && opened.price > 0 && <p className="text-xl font-bold text-success">₪{opened.price.toLocaleString('he-IL')}</p>}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {([['סוג', opened.type], ['חדרים', opened.rooms], ['שטח (מ״ר)', opened.size_sqm], ['קומה', opened.floor], ['מרפסת (מ״ר)', opened.balcony_sqm], ['חניות', opened.parking], ['מספר יחידות', opened.count], ['זמינות', opened.availability ?? opened.status], ['מועד מסירה', opened.delivery_date ?? opened.deliveryDate], ['תיאור', opened.description], ['מפרט', opened.specifications ?? sourceRecord(opened.source_details).specifications], ['מאפיינים', opened.features ?? opened.amenities], ...extra] as const).filter(([, value]) => labelValue(value)).map(([label, value]) => <div key={String(label)}><dt className="text-muted-foreground">{String(label)}</dt><dd className="break-words whitespace-pre-line font-medium">{labelValue(value)}</dd></div>)}
          </dl>
          {opened.images.length > 0 && <PropertyGallerySlider photos={opened.images} alt="תמונות היחידה" />}
          <DeveloperCommissionBadges project={project} unit={opened} />
          <div className="flex flex-wrap gap-2">
            {onPublish && <Button variant="outline" disabled={projectCommissionErrors(project, opened).length > 0} onClick={() => onPublish(opened)}>פרסום היחידה בלוח</Button>}
            {onPost && <Button variant="outline" onClick={() => onPost(opened)}>יצירת קמפיין ליחידה</Button>}
          </div>
        </div>}
      </DialogContent>
    </Dialog>
  </div>;
}
export default function ProjectHierarchyDetails({ project, onPublish, onPost, enlarged = false }: { project: DeveloperProject; onPublish?: (unit: ProjectUnit) => void; onPost?: (unit: ProjectUnit) => void; enlarged?: boolean }) {
  const { buildings, apartments, unassigned } = savedProjectHierarchy(project);
  const details = sourceRecord(project.source_details);
  const manual = sourceRecord(details.manual);
  const specs = labelValue(manual.specifications ?? details.specifications ?? details.specification);
  const sourceProject = project as DeveloperProject & { source_status?: string | null; timeline?: unknown[] };
  const timeline = (sourceProject.timeline ?? []).map(value => ({ label: timelineLabel(value), completed: sourceRecord(value).completed === true, current: sourceRecord(value).current === true })).filter(item => item.label);
  return <div className={enlarged ? 'min-w-0 space-y-4 text-lg [&_.text-sm]:text-base [&_.text-xs]:text-sm [&_button]:text-base' : 'min-w-0 space-y-4'}>
    {(timeline.length > 0 || sourceProject.source_status) && <section aria-label="ציר זמן הפרויקט" className="space-y-2">
      {sourceProject.source_status && <h3 className="font-semibold">{sourceProject.source_status}</h3>}
      <ProjectTimelineBar timeline={sourceProject.timeline} />
    </section>}
    {(project.description || labelValue(details.info)) && <p className="whitespace-pre-line text-sm leading-relaxed">{project.description || labelValue(details.info)}</p>}
    <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">{project.address && <span>{project.address}</span>}{project.delivery_date && <span>מסירה: {project.delivery_date}</span>}{project.total_units != null && <span>{project.total_units} יח״ד</span>}{project.available_units != null && <span>{project.available_units} זמינות</span>}</div>
    {specs && <p className="whitespace-pre-line text-sm">{specs}</p>}
    {labelValue(manual.amenities ?? details.amenities) && <p className="text-sm text-muted-foreground">{labelValue(manual.amenities ?? details.amenities)}</p>}
    <Accordion type="single" collapsible>
      {buildings.map((building, index) => <AccordionItem value={building.source_building_id} key={building.source_building_id}>
        <AccordionTrigger className="hover:no-underline"><span className="flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" />{building.name ? `בניין ${building.name}` : `בניין ${index + 1}`}<span className="text-sm font-normal text-muted-foreground">{building.units.length} סוגי יחידות</span></span></AccordionTrigger>
        <AccordionContent>
          <p className="mb-2 text-sm text-muted-foreground">{[building.address, building.deliveryDate, building.description].map(labelValue).filter(Boolean).join(' · ')}</p>
          {building.units.length ? <UnitDetails units={building.units} project={project} onPublish={onPublish} onPost={onPost} /> : null}
        </AccordionContent>
      </AccordionItem>)}
    </Accordion>
    {unassigned.length > 0 && <div><h3 className="text-sm font-semibold">{buildings.length ? 'יחידות ללא שיוך לבניין' : 'דירות וסוגי יחידות'}</h3><UnitDetails units={unassigned} project={project} onPublish={onPublish} onPost={onPost} /></div>}
  </div>;
}