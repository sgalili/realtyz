import { useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ClosingFeeSlider } from '@/components/affiliate/ClosingFeeSlider';
import { assignDeveloperFees, emptyDeveloperFees, matchingCommissionUnits, unitCommissionKey, type DeveloperCommissionConfig } from '@/lib/developerCommissions';
import type { ProjectUnit } from '../../../supabase/functions/_shared/projectHierarchy';
import { LeadRewardCard, LEAD_REWARD_TYPES, RewardCardsTitle } from '@/components/public/LeadRewardCard';
import LeadQuestionsDialog from '@/components/affiliate/LeadQuestionsDialog';
import LeadFormFieldsDialog from '@/components/affiliate/LeadFormFieldsDialog';
import { defaultQuestions } from '@/lib/leadTiers';
export default function DeveloperCommissionEditor({ value, units, price, deal, onChange }: { value: DeveloperCommissionConfig; units: ProjectUnit[]; price: number; deal: string; onChange: (value: DeveloperCommissionConfig) => void }) {
  const [fees, setFees] = useState(() => structuredClone(value.defaults ?? emptyDeveloperFees()));
  const [questionsOpen, setQuestionsOpen] = useState<'questions' | 'questions_phone' | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [building, setBuilding] = useState('all'); const [rooms, setRooms] = useState('all'); const [type, setType] = useState('all'); const [unitKey, setUnitKey] = useState('all'); const [applied, setApplied] = useState(false);
  const selector = { building: building === 'all' ? undefined : building, rooms: rooms === 'all' ? undefined : Number(rooms), type: type === 'all' ? undefined : type, unitKey: unitKey === 'all' ? undefined : unitKey };
  const matched = matchingCommissionUnits(units, selector); const scoped = Object.values(selector).some(v => v !== undefined);
  const select = (label: string, current: string, setter: (v: string) => void, options: [string, string][]) => <div className="space-y-1"><Label>{label}</Label><Select value={current} onValueChange={v => { setter(v); setApplied(false); }}><SelectTrigger aria-label={label}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">כולם</SelectItem>{options.map(([v, text]) => <SelectItem key={v} value={v}>{text}</SelectItem>)}</SelectContent></Select></div>;
  return <section className="space-y-4"><div className="grid grid-cols-2 gap-3">
    {select('בניין', building, setBuilding, [...new Map(units.filter(u => u.building_id).map(u => [String(u.building_id), String(u.building_name ?? u.building_id)])).entries()])}
    {select('חדרים', rooms, setRooms, [...new Set(units.map(u => u.rooms).filter(v => v != null))].map(v => [String(v), String(v)]))}
    {select('סוג נכס', type, setType, [...new Set(units.map(u => u.type).filter((v): v is string => !!v))].map(v => [v, v]))}
    {select('יחידה', unitKey, v => { setUnitKey(v); const existing = value.overrides?.[v] ?? value.defaults; if (existing) setFees(structuredClone(existing)); }, units.map((u, index) => [unitCommissionKey(u), `${u.building_name ?? ''} · ${u.rooms ?? ''} חדרים · ${index + 1}`]))}
  </div>
  <RewardCardsTitle />
  <ClosingFeeSlider publisherCard dualMode className="pricing-closing-card rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-sm" dealType={deal} price={price} value={fees.closing.value ?? 0} valueType={fees.closing.type} onValueChange={(v, mode) => { setApplied(false); setFees(old => ({ ...old, closing: { type: mode === 'fixed' ? 'fixed' : 'percent', value: v } })); }} onChange={v => { setApplied(false); setFees(old => ({ ...old, closing: { type: 'percent', value: v } })); }} />
  {LEAD_REWARD_TYPES.map(({ tier, label }) => <LeadRewardCard key={tier} tier={tier} label={label} value={fees[tier] == null ? '' : String(fees[tier])} onChange={v => { setApplied(false); setFees(old => ({ ...old, [tier]: v === '' ? null : Number(v) })); }} limit={fees.caps[tier] == null ? '' : String(fees.caps[tier])} onLimitChange={v => { setApplied(false); setFees(old => ({ ...old, caps: { ...old.caps, [tier]: v === '' ? null : Number(v) } })); }}>
    {tier === 'form' ? <Button variant="outline" size="sm" onClick={() => setFormOpen(true)}>שדות טופס הפנייה</Button> : <Button variant="outline" size="sm" onClick={() => setQuestionsOpen(tier === 'whatsapp' ? 'questions' : 'questions_phone')}>{tier === 'whatsapp' ? 'שאלות סינון בווטסאפ' : 'שאלות סינון בטלפון'}</Button>}
  </LeadRewardCard>)}
  <Button variant="outline" disabled={scoped && matched.length === 0} onClick={() => { onChange(assignDeveloperFees(value, units, selector, fees)); setApplied(true); }}><Check />{scoped ? `החלה על ${matched.length} יחידות` : 'הגדרת ברירת מחדל לפרויקט וליחידות'}</Button>{applied && <p role="status" className="text-sm text-success">העמלות הוגדרו; יש לאשר שמירה</p>}
  <LeadFormFieldsDialog open={formOpen} onOpenChange={setFormOpen} fields={fees.form_fields ?? []} onChange={form_fields => { setApplied(false); setFees(old => ({ ...old, form_fields })); }} />
  {questionsOpen && <LeadQuestionsDialog open onOpenChange={open => { if (!open) setQuestionsOpen(null); }} title={questionsOpen === 'questions' ? 'שאלות סינון בווטסאפ' : 'שאלות סינון בטלפון'} questions={fees[questionsOpen] ?? defaultQuestions(deal)} onChange={questions => { setApplied(false); setFees(old => ({ ...old, [questionsOpen]: questions })); }} />}
  </section>;
}