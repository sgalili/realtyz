import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Finance from '@/pages/Finance';

export default function Billing() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'finance';

  const setTab = (v: string) => {
    const next = new URLSearchParams(params);
    next.set('tab', v);
    setParams(next, { replace: true });
  };

  return (
    <div dir="rtl" className="mx-auto w-full max-w-4xl space-y-4 p-2 sm:p-4">
      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        <TabsList className="grid w-full grid-cols-1 mb-[15px]">
          <TabsTrigger value="finance">חשבוניות ותשלומים</TabsTrigger>
        </TabsList>
        <TabsContent value="finance" className="mt-4"><Finance /></TabsContent>
      </Tabs>
    </div>
  );
}
