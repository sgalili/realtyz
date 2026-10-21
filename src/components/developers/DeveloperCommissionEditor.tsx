import { useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ClosingFeeSlider } from '@/components/affiliate/ClosingFeeSlider';
import { assignDeveloperFees, emptyDeveloperFees, matchingCommissionUnits, unitCommissionKey, type DeveloperCommissionConfig } from '@/lib/developerCommissions';
import type { ProjectUnit } from '../../../supabase/functions/_shared/projectHierarchy';
export default function DeveloperCommissionEditor({ value, units, price, deal, onChange }: { value: DeveloperCommissionConfig; units: ProjectUnit[]; price: number; deal: string; onChange: (value: DeveloperCommissionConfig) => void }) {
  const [fees, setFees] = useState(() => structuredClone(value.defaults ?? emptyDeveloperFees()));
  const [building, setBuilding] = useState('all'); const [rooms, setRooms] = useState('all'); const [type, setType] = useState('all'); const [unitKey, setUnitKey] = useState('all'); const [applied, setApplied] = useState(false);
  const selector = { building: building === 'all' ? undefined : building, rooms: rooms === 'all' ? undefined : Number(rooms), type: type === 'all' ? undefined : type, unitKey: unitKey === 'all' ? undefined : unitKey };
  const matched = matchingCommissionUnits(units, selector); const scoped = Object.values(selector).some(v => v !== undefined);
  const select = (label: string, current: string, setter: (v: string) => void, options: [string, string][]) => <div className="space-y-1"><Label>{label}</Label><Select value={current} onValueChange={v => { setter(v); setApplied(false); }}><SelectTrigger aria-label={label}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">כולם</SelectItem>{options.map(([v, text]) => <SelectItem key={v} value={v}>{text}</SelectItem>)}</SelectContent></Select></div>;
  return <section className="space-y-4 border-t border-border pt-4"><h3 className="text-lg font-bold">עמלות</h3><div className="grid grid-cols-2 gap-3">
    {select('בניין', building, setBuilding, [...new Map(units.filter(u => u.building_id).map(u => [String(u.building_id), String(u.building_name ?? u.building_id)])).entries()])}
    {select('חדרים', rooms, setRooms, [...new Set(units.map(u => u.rooms).filter(v => v != null))].map(v => [String(v), String(v)]))}
    {select('סוג נכס', type, setType, [...new Set(units.map(u => u.type).filter((v): v is string => !!v))].map(v => [v, v]))}
    {select('יחידה', unitKey, v => { setUnitKey(v); const existing = value.overrides?.[v] ?? value.defaults; if (existing) setFees(structuredClone(existing)); }, units.map((u, index) => [unitCommissionKey(u), `${u.building_name ?? ''} · ${u.rooms ?? ''} חדרים · ${index + 1}`]))}
  </div>{(['form', 'whatsapp', 'phone'] as const).map((key, i) => <div key={key} className="grid grid-cols-2 gap-3"><div className="space-y-1"><Label htmlFor={`dev-fee-${key}`}>{['טופס ₪', 'WhatsApp ₪', 'טלפון ₪'][i]}</Label><Input id={`dev-fee-${key}`} type="number" min="0" max="500" dir="ltr" value={fees[key] ?? ''} onChange={e => { setApplied(false); setFees(old => ({ ...old, [key]: e.target.value === '' ? null : Number(e.target.value) })); }} /></div>{Number(fees[key]) > 0 && <div className="space-y-1"><Label htmlFor={`dev-cap-${key}`}>מגבלה ל־24 שעות</Label><Input id={`dev-cap-${key}`} type="number" min="1" step="1" dir="ltr" value={fees.caps[key] ?? ''} onChange={e => { setApplied(false); setFees(old => ({ ...old, caps: { ...old.caps, [key]: e.target.value === '' ? null : Number(e.target.value) } })); }} /></div>}</div>)}
  <Label>סגירת עסקה</Label>{fees.closing.type === 'fixed' && <Input aria-label="סגירת עסקה ₪" type="number" dir="ltr" value={fees.closing.value ?? ''} onChange={e => { setApplied(false); setFees(old => ({ ...old, closing: { type: 'fixed', value: e.target.value === '' ? null : Number(e.target.value) } })); }} />}
  <ClosingFeeSlider dealType={deal} price={price} value={fees.closing.value ?? 0} valueType={fees.closing.type} onChange={v => { setApplied(false); setFees(old => ({ ...old, closing: { type: 'percent', value: v } })); }} />
  <Button variant="outline" disabled={scoped && matched.length === 0} onClick={() => { onChange(assignDeveloperFees(value, units, selector, fees)); setApplied(true); }}><Check />{scoped ? `החלה על ${matched.length} יחידות` : 'הגדרת ברירת מחדל לפרויקט וליחידות'}</Button>{applied && <p role="status" className="text-sm text-success">העמלות הוגדרו; יש לאשר את שמירת הפרויקט</p>}</section>;
}