import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ChevronDown } from 'lucide-react';
import type { PublicListingDraftFields } from '@/lib/publicListingDraft';
import { toggleBalconyType } from '@/lib/propertyFormOptions';

const BALCONIES = ['מרפסת שמש', 'מרפסת שירות', 'מרפסת מקורה', 'מרפסת סוכה', 'מרפסת גג'];
const AIR_DIRECTIONS = ['צפון', 'דרום', 'מזרח', 'מערב', 'צפון-מזרח', 'צפון-מערב', 'דרום-מזרח', 'דרום-מערב', 'כל הכיוונים'];
const VIEWS = ['ללא נוף', 'נוף פתוח', 'נוף לים', 'נוף לעיר', 'נוף לפארק', 'נוף להרים', 'נוף ירוק'];
export function PropertyAmenitiesFields({ fields, onChange }: { fields: PublicListingDraftFields; onChange: (patch: Partial<PublicListingDraftFields>) => void }) {
  const balconies = fields.balconyTypes ?? (fields.balcony ? ['מרפסת שמש'] : []);
  const menus = [
    { label: 'חדרים', value: fields.rooms, options: ['1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5', '5.5', '6+'].map(value => [value, `${value} חדרים`]), change: (value: string) => onChange({ rooms: value }) },
    { label: 'מעלית', value: fields.elevatorCount ?? (fields.elevator ? '1' : ''), options: [['0', 'אין מעלית'], ['1', 'מעלית אחת'], ['2', '2 מעליות'], ['3+', '3 מעליות או יותר']], change: (value: string) => onChange({ elevatorCount: value, elevator: value !== '0' }) },
    { label: 'חניה', value: fields.parkingCount ?? (fields.parking ? '1' : ''), options: [['0', 'ללא חניה'], ['1', '1 חניה'], ['2', '2 חניות']], change: (value: string) => onChange({ parkingCount: value, parking: value !== '0' }) },
  ];
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
    {menus.map(menu => <div key={menu.label} className="min-w-0"><Select value={menu.value} onValueChange={menu.change}><SelectTrigger aria-label={menu.label} id={`amenity-${menu.label}`} className="min-w-0"><SelectValue placeholder={menu.label} /></SelectTrigger><SelectContent>{menu.options.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>)}
    <div className="min-w-0"><DropdownMenu dir="rtl"><DropdownMenuTrigger asChild><Button type="button" variant="outline" aria-label="מרפסת" className="h-10 w-full min-w-0 justify-between px-3 font-normal"><span className="truncate">{balconies.length ? balconies.join(', ') : 'מרפסת'}</span><ChevronDown className="h-4 w-4 shrink-0 opacity-50" /></Button></DropdownMenuTrigger><DropdownMenuContent align="start">{['ללא מרפסת', ...BALCONIES].map(option => <DropdownMenuCheckboxItem key={option} checked={option === 'ללא מרפסת' ? balconies.length === 0 : balconies.includes(option)} onSelect={event => event.preventDefault()} onCheckedChange={() => { const next = toggleBalconyType(balconies, option); onChange({ balconyTypes: next, balcony: next.length > 0 }); }}>{option}</DropdownMenuCheckboxItem>)}</DropdownMenuContent></DropdownMenu></div>
    <div className="min-w-0"><Select value={fields.viewType ?? (fields.openView ? 'נוף פתוח' : '')} onValueChange={value => onChange({ viewType: value, openView: value === 'נוף פתוח' })}><SelectTrigger aria-label="נוף" id="amenity-view"><SelectValue placeholder="נוף" /></SelectTrigger><SelectContent>{VIEWS.map(option => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select></div>
    <div className="min-w-0"><Select value={fields.airDirections} onValueChange={value => onChange({ airDirections: value })}><SelectTrigger aria-label="כיווני אוויר" id="amenity-air"><SelectValue placeholder="כיווני אוויר *" /></SelectTrigger><SelectContent>{AIR_DIRECTIONS.map(option => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select></div>
  </div>;
}