import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import CommissionTierBadges from '@/components/affiliate/CommissionTierBadges';
import { useUserRole } from '@/hooks/useUserRole';
import { useAffiliateLicense } from '@/hooks/useAffiliateLicense';
import { commissionConfig, effectiveUnitFees } from '@/lib/developerCommissions';
import { partnerNetReward } from '@/lib/affiliatePlans';
import type { DeveloperProject } from '@/lib/developerProjectForm';
import type { ProjectUnit } from '../../../supabase/functions/_shared/projectHierarchy';
export default function DeveloperCommissionBadges({ project, unit }: { project: DeveloperProject; unit?: ProjectUnit }) {
  const [open, setOpen] = useState(false); const { level4Unlocked } = useAffiliateLicense();
  const { isSuperAdmin, roles } = useUserRole();
  const showAll = isSuperAdmin || roles.some(role => ['managing_broker', 'lead_agent', 'agent'].includes(role));
  const fees = effectiveUnitFees(commissionConfig(project.commission_config), unit);
  if (!fees) return <span className="text-xs text-muted-foreground">עמלות טרם הוגדרו</span>;
  const tiers = { tier1: Number(fees.form), tier2: Number(fees.whatsapp), tier3: Number(fees.phone), tier4: Number(fees.closing.value), tier4Type: fees.closing.type };
  return <><Button variant="ghost" className="h-auto px-0 py-1" aria-label="פירוט עמלות ומגבלות" onClick={e => { e.stopPropagation(); setOpen(true); }}><CommissionTierBadges tiers={tiers} compact /></Button><Dialog open={open} onOpenChange={setOpen}><DialogContent dir="rtl" className="max-w-md"><DialogHeader><DialogTitle>עמלות ומגבלות</DialogTitle></DialogHeader><dl className="space-y-3">{(['form', 'whatsapp', 'phone'] as const).map((key, i) => (showAll || Number(fees[key]) > 0) && <div key={key} className="flex flex-wrap justify-between gap-2 border-b border-border py-2"><dt>{['טופס', 'WhatsApp', 'טלפון'][i]}</dt><dd>{Number(fees[key]) === 0 ? <span className="lead-no-fee">ללא עמלה</span> : <bdi className={key === 'form' ? 'text-lead-form' : key === 'whatsapp' ? 'text-lead-whatsapp' : 'text-lead-phone'}>₪{partnerNetReward(Number(fees[key])).toLocaleString('he-IL')}</bdi>} · {fees.caps[key] ?? '—'} ל־24 שעות</dd></div>)}{(showAll || (level4Unlocked && Number(fees.closing.value) > 0)) && <div className="flex justify-between gap-2"><dt>סגירת עסקה</dt><dd>{level4Unlocked ? Number(fees.closing.value) === 0 ? <span className="lead-no-fee">ללא עמלה</span> : <bdi>{fees.closing.type === 'fixed' ? '₪' : ''}{partnerNetReward(Number(fees.closing.value))}{fees.closing.type === 'percent' ? '%' : ''}</bdi> : null}</dd></div>}</dl></DialogContent></Dialog></>;
}