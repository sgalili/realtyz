import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Building2, ExternalLink, Globe, Megaphone, MoreVertical, Pencil } from 'lucide-react';
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
import PublicCardSummary from '@/components/public/PublicCardSummary';
import PublicAdHeading from '@/components/public/PublicAdHeading';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { formatPhoneDisplay } from '@/lib/formatPhone';
import type { PublicCard } from '@/pages/PublicListingsBoard';
import { RotateFirstTwoPhotosAction } from '@/components/admin/RotateFirstTwoPhotosAction';
import { DeveloperLogo } from './DeveloperLogo';
import { SelectBox } from '@/components/ui/multi-select-controls';
import { projectUnitSelectionKey } from '@/lib/developerProjectSelection';

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

/** Only curated Hebrew fields: raw source keys (slug, token, ids…) and source-site names never render. */
const hebrewOnly = (value: unknown) => { const text = labelValue(value).trim(); return /[\u0590-\u05FF]/.test(text) && !/יד\s?2|yad\s?2/i.test(text) ? text : ''; };
const numberOnly = (value: unknown) => { const text = labelValue(value).trim(); return /^-?\d+(\.\d+)?$/.test(text) ? text : ''; };
export function unitDisplayFields(unit: ProjectUnit, project: DeveloperProject): [string, string][] {
  const details = sourceRecord(unit.source_details);
  const floor = numberOnly(unit.floor);
  return ([
    ['פרויקט', hebrewOnly(project.name) || labelValue(project.name)],
    ['כתובת', [project.address, (project as { city?: string | null }).city].filter(Boolean).join(', ')],
    ['סוג נכס', hebrewOnly(unit.type)],
    ['חדרים', numberOnly(unit.rooms)],
    ['שטח', numberOnly(unit.size_sqm) && `${unit.size_sqm} מ״ר`],
    ['קומה', floor && (floor === '0' ? 'קרקע' : floor)],
    ['מרפסת', numberOnly(unit.balcony_sqm) && `${unit.balcony_sqm} מ״ר`],
    ['חניות', numberOnly(unit.parking) || hebrewOnly(unit.parking)],
    ['יחידות זמינות', numberOnly(unit.count)],
    ['זמינות', hebrewOnly(unit.availability ?? unit.status)],
    ['מועד מסירה', hebrewOnly(unit.delivery_date ?? unit.deliveryDate) || labelValue(unit.delivery_date ?? project.delivery_date).match(/^\d{4}(-\d{2})?(-\d{2})?$/)?.[0] || ''],
    ['תיאור', hebrewOnly(unit.description)],
    ['מפרט', hebrewOnly(unit.specifications ?? details.specifications)],
    ['מאפיינים', hebrewOnly(unit.features ?? unit.amenities)],
  ] as [string, string][]).filter(([, value]) => !!value);
}

export type ProjectDeveloperIdentity = {
  company_name: string;
  logo_url: string | null;
  phone: string | null;
  contact_name: string | null;
  contact_phone: string | null;
};

type UnitSelectionProps = {
  selectionMode?: boolean;
  selectedUnits?: Set<string>;
  onToggleUnit?: (key: string) => void;
};

type UnitActionProps = {
  unit: ProjectUnit;
  project: DeveloperProject;
  onOpen?: () => void;
  onPublish?: (unit: ProjectUnit) => void;
  onPost?: (unit: ProjectUnit) => void;
  onEdit?: () => void;
  onRotated?: () => void;
};

function DeveloperUnitMenu({ unit, project, onOpen, onPublish, onPost, onEdit, onRotated }: UnitActionProps) {
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`אפשרויות ${unitTitle(unit)}`} title="אפשרויות דירה" onClick={event => event.stopPropagation()}><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-64" onClick={event => event.stopPropagation()}>
      <DropdownMenuLabel className="text-xs">פעולות דירה</DropdownMenuLabel>
      {onOpen && <DropdownMenuItem className="gap-2" onSelect={onOpen}><ExternalLink className="h-4 w-4" />פרטי הדירה המלאים</DropdownMenuItem>}
      {onPost && <DropdownMenuItem className="gap-2" onSelect={() => onPost(unit)}><Megaphone className="h-4 w-4 text-primary" />יצירת קמפיין לדירה</DropdownMenuItem>}
      {onPublish && <DropdownMenuItem className="gap-2" onSelect={() => onPublish(unit)}><Globe className="h-4 w-4" />פרסום הדירה בלוח</DropdownMenuItem>}
      {onEdit && <DropdownMenuItem className="gap-2" onSelect={onEdit}><Pencil className="h-4 w-4" />עריכה מלאה של הפרויקט והדירות</DropdownMenuItem>}
      <RotateFirstTwoPhotosAction scope={{ type: 'project-unit', projectId: project.id, unitId: unit.source_unit_id, buildingId: unit.building_id, label: unitTitle(unit) }} onCompleted={onRotated} />
    </DropdownMenuContent>
  </DropdownMenu>;
}

function DeveloperIdentity({ developer }: { developer: ProjectDeveloperIdentity }) {
  return <section aria-label="פרטי היזם" className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/20 p-3">
    <DeveloperLogo name={developer.company_name} logoUrl={developer.logo_url} />
    <div className="min-w-0 space-y-1">
      <h3 className="break-words text-lg font-bold">{developer.company_name}</h3>
      <p className="text-sm text-muted-foreground">פרטי היזם</p>
      {developer.phone && <p className="text-sm"><span className="text-muted-foreground">טלפון החברה: </span><span dir="ltr">{formatPhoneDisplay(developer.phone)}</span></p>}
      {developer.contact_name && <p className="text-sm"><span className="text-muted-foreground">איש קשר: </span>{developer.contact_name}</p>}
      {developer.contact_phone && <p className="text-sm"><span className="text-muted-foreground">טלפון איש קשר: </span><span dir="ltr">{formatPhoneDisplay(developer.contact_phone)}</span></p>}
    </div>
  </section>;
}

function UnitDetails({ units, project, developer, grid, onPublish, onPost, onEdit, selectionMode = false, selectedUnits, onToggleUnit }: { units: ProjectUnit[]; project: DeveloperProject; developer?: ProjectDeveloperIdentity; grid: boolean; onPublish?: (unit: ProjectUnit) => void; onPost?: (unit: ProjectUnit) => void; onEdit?: () => void } & UnitSelectionProps) {
  const [opened, setOpened] = useState<ProjectUnit | null>(null);
  const edit = () => { setOpened(null); onEdit?.(); };
  return <div className="min-w-0">
    {grid ? <div className="property-card-grid">
      {units.map(unit => { const selectionKey = projectUnitSelectionKey(project.id, unit); return <div key={`${unit.building_id}:${unit.source_unit_id}`} className="relative">{selectionMode && <SelectBox className="absolute right-2 top-2 z-20 h-6 w-6 bg-background shadow-sm" checked={selectedUnits?.has(selectionKey) ?? false} onChange={() => onToggleUnit?.(selectionKey)} label={`בחירת ${unitTitle(unit)}`} />}<StandardPropertyCard card={unitCard(unit, project)} onOpen={() => setOpened(unit)} onFavorite={() => undefined} showContact={false} showOwnerMenu={false} menu={<DeveloperUnitMenu unit={unit} project={project} onOpen={() => setOpened(unit)} onPublish={onPublish} onPost={onPost} onEdit={onEdit} onRotated={() => setOpened(null)} />} /></div>; })}
    </div> : <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full min-w-[760px] text-right text-sm">
        <thead className="bg-muted/40 text-muted-foreground"><tr>{selectionMode && <th className="w-8 p-2"><span className="sr-only">בחירה</span></th>}<th className="p-2 font-semibold">תמונה</th><th className="p-2 font-semibold">דירה</th><th className="p-2 font-semibold">מחיר</th><th className="p-2 font-semibold">תגמולים</th><th className="p-2 font-semibold">חדרים</th><th className="p-2 font-semibold">מ״ר</th><th className="p-2 font-semibold">קומה</th><th className="p-2"><span className="sr-only">פעולות</span></th></tr></thead>
        <tbody className="divide-y divide-border/70">{units.map(unit => {
          const card = unitCard(unit, project);
          const selectionKey = projectUnitSelectionKey(project.id, unit);
          return <tr key={`${unit.building_id}:${unit.source_unit_id}`} tabIndex={0} onClick={() => setOpened(unit)} onKeyDown={event => { if (event.target !== event.currentTarget) return; if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setOpened(unit); } }} className="cursor-pointer hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {selectionMode && <td className="p-2"><SelectBox checked={selectedUnits?.has(selectionKey) ?? false} onChange={() => onToggleUnit?.(selectionKey)} label={`בחירת ${unitTitle(unit)}`} /></td>}
            <td className="p-2">{card.photos?.[0] ? <img src={card.photos[0]} alt="" className="h-12 w-12 rounded object-cover" /> : <div className="flex h-12 w-12 items-center justify-center rounded bg-muted"><Building2 className="h-5 w-5 text-muted-foreground" /></div>}</td>
            <td className="min-w-56 p-2"><PublicCardSummary card={card} showCommissions={false} showBroker={false} dense /></td>
            <td className="whitespace-nowrap p-2 text-[17px] font-bold text-success">{card.price ? `₪${Number(card.price).toLocaleString('he-IL')}` : ''}</td>
            <td className="p-2"><DeveloperCommissionBadges project={project} unit={unit} /></td>
            <td className="p-2">{card.rooms || ''}</td><td className="p-2">{card.sqm || ''}</td><td className="whitespace-nowrap p-2">{card.floor ?? ''}</td>
            <td className="p-2" onClick={event => event.stopPropagation()}><DeveloperUnitMenu unit={unit} project={project} onOpen={() => setOpened(unit)} onPublish={onPublish} onPost={onPost} onEdit={onEdit} onRotated={() => setOpened(null)} /></td>
          </tr>;
        })}</tbody>
      </table>
    </div>}
    <Dialog open={!!opened} onOpenChange={open => { if (!open) setOpened(null); }}>
      <DialogContent dir="rtl" className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="flex flex-row items-start gap-2 space-y-0">
          <DialogTitle className="min-w-0 flex-1">{opened ? unitTitle(opened) : ''}</DialogTitle>
          {opened && <div className="shrink-0" onClick={event => event.stopPropagation()}><DeveloperUnitMenu unit={opened} project={project} onPublish={onPublish} onPost={onPost} onEdit={edit} onRotated={() => setOpened(null)} /></div>}
        </DialogHeader>
        {opened && <div className="space-y-4">
          <PropertyGallerySlider photos={opened.images} alt={unitTitle(opened)} />
          <PublicAdHeading title={[project.name, unitTitle(opened)].join(' · ')} price={opened.price ? `₪${opened.price.toLocaleString('he-IL')}` : undefined} dealType="sale" />
          {developer && <DeveloperIdentity developer={developer} />}
          <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,150px),1fr))] gap-2 text-sm">
            {unitDisplayFields(opened, project).map(([label, value]) => <div key={label} className="rounded-lg border bg-background p-2.5"><dt className="text-[11px] text-muted-foreground">{label}</dt><dd className="break-words whitespace-pre-line font-semibold">{value}</dd></div>)}
          </dl>
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

export default function ProjectHierarchyDetails({ project, developer, grid = true, onPublish, onPost, onEdit, enlarged = false, selectionMode = false, selectedUnits, onToggleUnit }: { project: DeveloperProject; developer?: ProjectDeveloperIdentity; grid?: boolean; onPublish?: (unit: ProjectUnit) => void; onPost?: (unit: ProjectUnit) => void; onEdit?: () => void; enlarged?: boolean } & UnitSelectionProps) {
  const { buildings, unassigned } = savedProjectHierarchy(project);
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
          {building.units.length ? <UnitDetails units={building.units} project={project} developer={developer} grid={grid} onPublish={onPublish} onPost={onPost} onEdit={onEdit} selectionMode={selectionMode} selectedUnits={selectedUnits} onToggleUnit={onToggleUnit} /> : null}
        </AccordionContent>
      </AccordionItem>)}
    </Accordion>
    {unassigned.length > 0 && <div><h3 className="text-sm font-semibold">{buildings.length ? 'יחידות ללא שיוך לבניין' : 'דירות וסוגי יחידות'}</h3><UnitDetails units={unassigned} project={project} developer={developer} grid={grid} onPublish={onPublish} onPost={onPost} onEdit={onEdit} selectionMode={selectionMode} selectedUnits={selectedUnits} onToggleUnit={onToggleUnit} /></div>}
  </div>;
}
