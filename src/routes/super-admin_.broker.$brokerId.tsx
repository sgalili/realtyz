import { createFileRoute } from '@tanstack/react-router';
import { SuperAdminRoute } from '@/app/AppRoutes';
import { BrokerOutreachPanel } from '@/components/admin/BrokerOutreachPanel';

export const Route=createFileRoute('/super-admin_/broker/$brokerId')({
  head:()=>({meta:[{title:'מסלול פנייה למתווך | TORAFF'},{name:'description',content:'ניהול פנייה בהסכמה, כניסה ראשונה ושיחת הדגמה של ריטה.'},{property:'og:title',content:'מסלול פנייה למתווך | TORAFF'},{property:'og:description',content:'ניהול פנייה בהסכמה, כניסה ראשונה ושיחת הדגמה של ריטה.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'}]}),
  component:()=>{const {brokerId}=Route.useParams();return <SuperAdminRoute><div className="mx-auto w-full max-w-2xl px-4 py-5"><BrokerOutreachPanel key={brokerId} brokerId={brokerId}/></div></SuperAdminRoute>;},
});