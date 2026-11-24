import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Phone, PhoneOff, Send, Mail, ExternalLink, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { getBrokerOutreach, cancelBrokerOutreachCall, configureBrokerOutreach } from '@/lib/brokerOutreach.functions';
import { canOverrideDemoCall } from '@/lib/brokerOutreachPolicy';
import { useSuperAdminGate } from '@/hooks/useSuperAdminGate';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useNavigate } from '@/lib/router-compat';
import { OfficialBrokerInvitationPanel } from './OfficialBrokerInvitationDialog';

const callLabels:Record<string,string>={not_scheduled:'טרם תוזמנה',consent_required:'נדרשת הסכמה לשיחת הדגמה',ready_to_schedule:'ממתין לתזמון',scheduling:'בתהליך תזמון',pending:'ממתינה לשיחה',cancelled:'בוטלה לטובת טיפול אישי',blocked:'התזמון לא הושלם',in_progress:'השיחה מתנהלת',completed:'השיחה הסתיימה'};
const eventLabels:Record<string,string>={first_otp_login:'כניסה ראשונה עם קוד',positive_reply:'תגובה חיובית',opt_out:'בקשת הסרה',voice_accepted:'הודעה קולית התקבלה לשליחה',voice_failed:'ההודעה הקולית לא הושלמה',call_scheduled:'שיחת הדגמה תוזמנה',call_cancelled:'שיחת הדגמה בוטלה',cancel_requested:'בקשת ביטול בטיפול',call_schedule_failed:'תזמון שיחה נכשל',admin_whatsapp_accepted:'התראת מנהל התקבלה לשליחה',admin_whatsapp_failed:'התראת WhatsApp למנהל נכשלה',call_status:'עדכון מצב השיחה',reply_handoff_failed:'עיבוד התגובה לא הושלם'};

export function BrokerOutreachPanel({brokerId}:{brokerId:string}) {
  const gate=useSuperAdminGate();const qc=useQueryClient();const navigate=useNavigate();const {setActiveWorkspace}=useWorkspace();
  const read=useServerFn(getBrokerOutreach);const cancel=useServerFn(cancelBrokerOutreachCall);
  const configure=useServerFn(configureBrokerOutreach);
  const [now,setNow]=useState(Date.now());const [enabled,setEnabled]=useState(false);const [messageConsent,setMessageConsent]=useState(false);const [callConsent,setCallConsent]=useState(false);const [note,setNote]=useState('');const [loaded,setLoaded]=useState(false);const [channel,setChannel]=useState<'whatsapp'|'email'|null>(null);const [feedback,setFeedback]=useState('');
  const state=useQuery({queryKey:['broker-outreach',gate.uid,brokerId],enabled:gate.enabled,queryFn:()=>read({data:{brokerId}}),refetchInterval:5000});
  useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(id);},[]);
  useEffect(()=>{if(state.data&&!loaded){const j=state.data.journey;setEnabled(j?.enabled??false);setMessageConsent(!!j?.message_consent_at);setCallConsent(!!j?.call_consent_at);setNote(j?.consent_note??'');setLoaded(true);}},[state.data,loaded]);
  const save=useMutation({mutationFn:()=>configure({data:{brokerId,enabled,messageConsent,callConsent,note}}),onSuccess:result=>{setFeedback(result.cancelled?'מסלול הפנייה נשמר ושיחת ריטה בוטלה.':'מסלול הפנייה נשמר. לא נשלחה הודעה.');void qc.invalidateQueries({queryKey:['broker-outreach']});},onError:(e:Error)=>setFeedback(e.message)});
  const override=useMutation({mutationFn:()=>cancel({data:{brokerId}}),onSuccess:r=>{setFeedback(r.cancelled?'שיחת ריטה בוטלה. אפשר לחייג באופן אישי.':'בקשת הביטול נשמרה; יש להמתין לאישור לפני חיוג אישי.');void state.refetch();},onError:(e:Error)=>setFeedback(e.message)});
  const email=useMutation({mutationFn:async()=>{
    const p=state.data?.property;if(!p?.address||!p.city)throw new Error('אין כתובת ועיר ממודעת יד2 לפנייה אישית');
    const first=state.data?.profile.full_name?.split(/\s+/)[0]??'';
    const {data,error}=await supabase.functions.invoke('admin-broker-email-invitation',{body:{action:'send_batch',broker_id:brokerId,limit:1,demo:true,outreach:true,message:`שלום ${first}, ראינו את המודעה שלך ב${p.address}, ${p.city}. TORAFF מרכזת נכסים, פניות, משימות וקמפיינים למתווכים. אפשר להתרשם ללא תשלום. אם מעניין לשמוע הסבר קצר מריטה, אפשר להשיב למייל הזה. בכל הודעה יש קישור להסרה.`,subject:`${first}, היכרות קצרה עם TORAFF`}});
    if(error||data?.error||data?.sent!==1)throw new Error(data?.error??'המייל לא נשלח; נדרשת הסכמת מייל מתועדת וכתובת תקינה');
  },onSuccess:()=>{setFeedback('המייל התקבל לשליחה. מסירה ותשובה טרם אומתו.');setChannel(null);void state.refetch();},onError:(e:Error)=>setFeedback(e.message)});
  if(!gate.enabled)return null;
  if(state.isLoading)return <p role="status">טוען מסלול פנייה…</p>;
  if(!state.data)return <p role="alert" className="text-destructive">טעינת מסלול הפנייה נכשלה</p>;
  const {journey:j,profile,property,events}=state.data;
  const seconds=j?.call_due_at?Math.max(0,Math.ceil((Date.parse(j.call_due_at)-now)/1000)):0;
  const canCancel=!!j?.call_due_at&&canOverrideDemoCall(j.call_status==='scheduling'?'pending':j.call_status,j.call_due_at,now);
  return <section dir="rtl" className="space-y-4 min-w-0">
    <div className="flex items-center justify-between gap-2"><div className="min-w-0"><h2 className="text-xl font-semibold break-words">{profile.full_name||'מסלול פנייה למתווך'}</h2><p className="text-sm text-muted-foreground">{property?.address&&property.city?`${property.address}, ${property.city}`:'אין כתובת יד2 שמורה לפנייה אישית'}</p></div><Button variant="ghost" size="icon" aria-label="רענון מסלול הפנייה" onClick={()=>void state.refetch()}><RefreshCw className="h-4 w-4"/></Button></div>
    <div className="flex items-center justify-between"><Label htmlFor={`outreach-${brokerId}`}>מסלול פנייה בהסכמה</Label><Switch id={`outreach-${brokerId}`} checked={enabled} onCheckedChange={setEnabled}/></div>
    <Label className="flex items-start gap-2 leading-6"><Checkbox checked={messageConsent} onCheckedChange={v=>setMessageConsent(v===true)}/>ניתנה הסכמה לקבלת הפנייה</Label>
    <Label className="flex items-start gap-2 leading-6"><Checkbox checked={callConsent} onCheckedChange={v=>setCallConsent(v===true)}/>ניתנה הסכמה מפורשת לשיחת הדגמה אוטומטית</Label>
    <Input aria-label="תיעוד ההסכמה" placeholder="מתי וכיצד ניתנה ההסכמה" value={note} onChange={e=>setNote(e.target.value)}/>
    <Button variant="outline" disabled={save.isPending||((messageConsent||callConsent)&&note.trim().length<3)} onClick={()=>save.mutate()}>שמירת המסלול</Button>
    <div className="flex items-center justify-between border-y border-border py-3"><span>1 · פנייה אישית</span><div className="flex gap-1"><Button variant="ghost" size="icon" aria-label="פנייה אישית בוואטסאפ" title="פנייה אישית בוואטסאפ" disabled={!j?.enabled||!j.message_consent_at||!!j.outreach_message_id} onClick={()=>setChannel('whatsapp')}><Send className="h-4 w-4"/></Button><Button variant="ghost" size="icon" aria-label="פנייה אישית במייל" title="פנייה אישית במייל" disabled={!j?.enabled||!j.message_consent_at||!!j.outreach_message_id} onClick={()=>setChannel('email')}><Mail className="h-4 w-4"/></Button></div></div>
    <div className="flex flex-wrap items-center justify-between gap-2"><span>2 · הודעה קולית לאחר תגובה חיובית</span><span className="text-sm text-muted-foreground">{j?.voice_status==='accepted'?'התקבלה לשליחה':j?.voice_status==='needs_review'?'נדרשת בדיקה':j?.interested_at?'בעיבוד':'ממתינה להתעניינות'}</span></div>
    <div className="space-y-2 border-t border-border pt-3"><div className="flex items-center justify-between gap-2"><span>3 · שיחת הדגמה של ריטה</span><span role="timer" className="tabular-nums text-primary">{j?.call_status==='pending'&&seconds>0?`${seconds} שניות`:callLabels[j?.call_status??'not_scheduled']??j?.call_status}</span></div><div className="flex items-center justify-between gap-2"><Button variant="outline" disabled={!canCancel||override.isPending} onClick={()=>override.mutate()}><PhoneOff className="h-4 w-4"/>ביטול שיחת ריטה</Button>{j?.call_status==='cancelled'&&profile.phone&&<Button variant="outline" asChild><a href={`tel:${profile.phone}`}><Phone className="h-4 w-4"/>חיוג אישי</a></Button>}</div></div>
    {j?.last_error&&<p role="alert" className="text-sm text-destructive break-words">{j.last_error}</p>}
    {feedback&&<p role="status" className="text-sm">{feedback}</p>}
    <Button variant="ghost" onClick={async()=>{await setActiveWorkspace(brokerId);navigate('/properties');}}><ExternalLink className="h-4 w-4"/>פתיחת חשבון המתווך</Button>
    {events.length>0&&<div className="space-y-2 border-t border-border pt-3"><h3 className="font-semibold">היסטוריית המסלול</h3>{events.map(e=><div key={e.id} className="flex items-start justify-between gap-2 text-sm"><span>{eventLabels[e.kind]??'עדכון מסלול'}</span><time className="shrink-0 text-muted-foreground">{new Date(e.created_at).toLocaleString('he-IL',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</time></div>)}</div>}
    <Dialog open={channel!==null} onOpenChange={open=>{if(!open)setChannel(null);}}><DialogContent dir="rtl" className="max-h-[85dvh] max-w-xl overflow-y-auto"><DialogHeader><DialogTitle>פנייה אישית ל־{profile.full_name}</DialogTitle></DialogHeader>{channel==='whatsapp'?<OfficialBrokerInvitationPanel broker={{id:brokerId,full_name:profile.full_name}} outreach useDiscoveredWhatsApp onClose={()=>setChannel(null)} onSent={()=>void state.refetch()}/>:<><p className="whitespace-pre-wrap text-base">שלום {profile.full_name?.split(/\s+/)[0]}, ראינו את המודעה שלך ב{property?.address}, {property?.city}. TORAFF מרכזת נכסים, פניות, משימות וקמפיינים למתווכים. אפשר להתרשם ללא תשלום ולהשיב לקבלת הסבר קצר מריטה.</p><div className="flex justify-between"><Button variant="outline" onClick={()=>setChannel(null)}>ביטול</Button><Button disabled={email.isPending} onClick={()=>email.mutate()}><Mail className="h-4 w-4"/>שליחת מייל</Button></div></>}</DialogContent></Dialog>
  </section>;
}