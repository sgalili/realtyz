import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_DYNAMIC_QR_DESTINATION, safeDynamicQrDestination } from '@/lib/dynamicQr';

export default function DynamicQrRedirect() {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let active = true;
    const resolve = async () => {
      const { data, error } = await supabase.rpc('resolve_dynamic_qr_destination');
      if (!active) return;
      const destination = error ? DEFAULT_DYNAMIC_QR_DESTINATION : safeDynamicQrDestination(data);
      window.location.replace(destination);
    };
    void resolve();
    return () => { active = false; };
  }, []);

  return (
    <main dir="rtl" className="flex min-h-[60vh] items-center justify-center bg-background px-4 text-foreground">
      <p className="text-base font-medium" role="status">מעבירים אותך ליעד…</p>
    </main>
  );
}
