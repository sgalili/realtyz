import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ChevronDown } from 'lucide-react';
import type { PublicListingDraftFields } from '@/lib/publicListingDraft';
import { toggleBalconyType, PROPERTY_ROOM_OPTIONS, PROPERTY_BALCONY_OPTIONS, PROPERTY_VIEW_OPTIONS, PROPERTY_AIR_OPTIONS } from '@/lib/propertyFormOptions';

const BALCONIES = PROPERTY_BALCONY_OPTIONS;
const AIR_DIRECTIONS = PROPERTY_AIR_OPTIONS;
const VIEWS = PROPERTY_VIEW_OPTIONS;
export function PropertyAmenitiesFields({ fields, onChange, filterMode = false, hideRooms = false }: { fields: PublicListingDraftFields; onChange: (patch: Partial<PublicListingDraftFields>) => void; filterMode?: boolean; hideRooms?: boolean }) {
  const balconies = fields.balconyTypes ?? (fields.balcony ? ['מרפסת שמש'] : []);
  const menus = [
    { label: 'חדרים', value: fields.rooms, options: PROPERTY_ROOM_OPTIONS.map(value => [value, `${value} חדרים`]), change: (value: string) => onChange({ rooms: value }) },
    { label: 'מעלית', value: fields.elevatorCount ?? (fields.elevator ? '1' : ''), options: [['0', 'אין מעלית'], ['1', 'מעלית אחת'], ['2', '2 מעליות'], ['3+', '3 מעליות או יותר']], change: (value: string) => onChange({ elevatorCount: value, elevator: value !== '0' }) },
    { label: 'חניה', value: fields.parkingCount ?? (fields.parking ? '1' : ''), options: [['0', 'ללא חניה'], ['1', '1 חניה'], ['2', '2 חניות']], change: (value: string) => onChange({ parkingCount: value, parking: value !== '0' }) },
  ];
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
    {menus.filter(menu => !hideRooms || menu.label !== 'חדרים').map(menu => <div key={menu.label} className="min-w-0"><Select value={menu.value || undefined} onValueChange={value => menu.change(value === 'all' ? '' : value)}><SelectTrigger aria-label={menu.label} id={`amenity-${menu.label}`} className="min-w-0"><SelectValue placeholder={menu.label} /></SelectTrigger><SelectContent>{filterMode && <SelectItem value="all">הכל</SelectItem>}{menu.options.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>)}
    <div className="min-w-0"><DropdownMenu dir="rtl"><DropdownMenuTrigger asChild><Button type="button" variant="outline" aria-label="מרפסת" className="h-10 w-full min-w-0 justify-between px-3 font-normal"><span className="truncate">{balconies.length ? balconies.join(', ') : 'מרפסת'}</span><ChevronDown className="h-4 w-4 shrink-0 opacity-50" /></Button></DropdownMenuTrigger><DropdownMenuContent align="start">{['ללא מרפסת', ...BALCONIES].map(option => <DropdownMenuCheckboxItem key={option} checked={option === 'ללא מרפסת' ? balconies.length === 0 : balconies.includes(option)} onSelect={event => event.preventDefault()} onCheckedChange={() => { const next = toggleBalconyType(balconies, option); onChange({ balconyTypes: next, balcony: next.length > 0 }); }}>{option}</DropdownMenuCheckboxItem>)}</DropdownMenuContent></DropdownMenu></div>
    <div className="min-w-0"><Select value={fields.viewType || (fields.openView ? 'נוף פתוח' : undefined)} onValueChange={value => onChange({ viewType: value === 'all' ? '' : value, openView: value === 'נוף פתוח' })}><SelectTrigger aria-label="נוף" id="amenity-view"><SelectValue placeholder="נוף" /></SelectTrigger><SelectContent>{filterMode && <SelectItem value="all">הכל</SelectItem>}{VIEWS.map(option => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select></div>
    <div className="min-w-0"><Select value={fields.airDirections || undefined} onValueChange={value => onChange({ airDirections: value === 'all' ? '' : value })}><SelectTrigger aria-label="כיווני אוויר" id="amenity-air"><SelectValue placeholder="כיווני אוויר" /></SelectTrigger><SelectContent>{filterMode && <SelectItem value="all">הכל</SelectItem>}{AIR_DIRECTIONS.map(option => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select></div>
  </div>;
}