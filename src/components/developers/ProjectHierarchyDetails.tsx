import { Building2 } from 'lucide-react';
import DeveloperCommissionBadges from './DeveloperCommissionBadges';
import { Button } from '@/components/ui/button';
import { projectCommissionErrors } from '@/lib/developerCommissions';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import PropertyGallerySlider from '@/components/public/PropertyGallerySlider';
import { savedProjectHierarchy } from '@/lib/developerProjectBoard';
import { sourceRecord, type ProjectUnit } from '../../../supabase/functions/_shared/projectHierarchy';
import type { DeveloperProject } from '@/lib/developerProjectForm';

const labelValue = (value: unknown): string => {
  if (value == null) return '';
  if (typeof value === 'boolean') return value ? 'כן' : 'לא';
  if (Array.isArray(value)) return value.map(labelValue).filter(Boolean).join(' · ');
  if (typeof value === 'object') { const row = sourceRecord(value); return labelValue(row.text ?? row.name ?? row.label ?? row.value); }
  return String(value);
};
function UnitDetails({ units, project, onPublish }: { units: ProjectUnit[]; project: DeveloperProject; onPublish?: (unit: ProjectUnit) => void }) {
  return <Accordion type="single" collapsible className="min-w-0">
    {units.map(unit => <AccordionItem value={`${unit.building_id}:${unit.source_unit_id}`} key={`${unit.building_id}:${unit.source_unit_id}`}>
      <AccordionTrigger className="gap-3 py-3 text-start hover:no-underline">
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2 text-sm">
          <span>{[labelValue(unit.type), unit.rooms != null ? `${unit.rooms} חדרים` : '', unit.size_sqm != null ? `${unit.size_sqm} מ״ר` : '', unit.floor != null ? `קומה ${unit.floor}` : ''].filter(Boolean).join(' · ') || `יחידה ${unit.source_unit_id}`}</span>
          {unit.price != null && unit.price > 0 && <strong className="whitespace-nowrap text-success">₪{unit.price.toLocaleString('he-IL')}</strong>}
        </div>
      </AccordionTrigger>
      <AccordionContent className="space-y-3">
        <DeveloperCommissionBadges project={project} unit={unit} />
        {onPublish && <Button variant="outline" disabled={projectCommissionErrors(project, unit).length > 0} onClick={() => onPublish(unit)}>פרסום היחידה בלוח</Button>}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {([['מרפסת (מ״ר)', unit.balcony_sqm], ['חניות', unit.parking], ['מספר יחידות', unit.count], ['זמינות', unit.availability ?? unit.status], ['מועד מסירה', unit.delivery_date ?? unit.deliveryDate], ['תיאור', unit.description], ['מפרט', unit.specifications ?? sourceRecord(unit.source_details).specifications], ['מאפיינים', unit.features ?? unit.amenities]] as const).filter(([, value]) => labelValue(value)).map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="break-words whitespace-pre-line font-medium">{labelValue(value)}</dd></div>)}
        </dl>
        {unit.images.length > 0 && <PropertyGallerySlider photos={unit.images} alt="תמונות היחידה" />}
      </AccordionContent>
    </AccordionItem>)}
  </Accordion>;
}
export default function ProjectHierarchyDetails({ project, onPublish }: { project: DeveloperProject; onPublish?: (unit: ProjectUnit) => void }) {
  const { buildings, apartments, unassigned } = savedProjectHierarchy(project);
  const details = sourceRecord(project.source_details);
  const manual = sourceRecord(details.manual);
  const specs = labelValue(manual.specifications ?? details.specifications ?? details.specification);
  return <div className="min-w-0 space-y-4">
    {(project.description || labelValue(details.info)) && <p className="whitespace-pre-line text-sm leading-relaxed">{project.description || labelValue(details.info)}</p>}
    <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">{project.address && <span>{project.address}</span>}{project.delivery_date && <span>מסירה: {project.delivery_date}</span>}{project.total_units != null && <span>{project.total_units} יח״ד</span>}{project.available_units != null && <span>{project.available_units} זמינות</span>}</div>
    {specs && <p className="whitespace-pre-line text-sm">{specs}</p>}
    {labelValue(manual.amenities ?? details.amenities) && <p className="text-sm text-muted-foreground">{labelValue(manual.amenities ?? details.amenities)}</p>}
    <Accordion type="single" collapsible>
      {buildings.map((building, index) => <AccordionItem value={building.source_building_id} key={building.source_building_id}>
        <AccordionTrigger className="hover:no-underline"><span className="flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" />{building.name ? `בניין ${building.name}` : `בניין ${index + 1}`}<span className="text-sm font-normal text-muted-foreground">{building.units.length} סוגי יחידות</span></span></AccordionTrigger>
        <AccordionContent>
          <p className="mb-2 text-sm text-muted-foreground">{[building.address, building.deliveryDate, building.description].map(labelValue).filter(Boolean).join(' · ')}</p>
          {building.units.length ? <UnitDetails units={building.units} project={project} onPublish={onPublish} /> : <p className="text-sm text-muted-foreground">פרטי היחידות לא זמינים במקור</p>}
        </AccordionContent>
      </AccordionItem>)}
    </Accordion>
    {unassigned.length > 0 && <div><h3 className="text-sm font-semibold">{buildings.length ? 'יחידות ללא שיוך לבניין' : 'דירות וסוגי יחידות'}</h3><UnitDetails units={unassigned} project={project} onPublish={onPublish} /></div>}
    {!apartments.length && !buildings.length && <p className="text-sm text-muted-foreground">פרטי הבניינים והיחידות לא זמינים במקור</p>}
  </div>;
}