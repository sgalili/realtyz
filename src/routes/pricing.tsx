import { createFileRoute } from "@tanstack/react-router";
import { Navigate } from "@/lib/router-compat";
import { useBrokersOnly } from '@/hooks/usePlatformMode';
import { BrokersPricing } from '@/components/legal/BrokersOnlyLegal';
import { PublicProfileShell } from '@/components/public/PublicProfileShell';
import { visitorRouteHead } from '@/lib/platformPresentation';

export const Route = createFileRoute("/pricing")({
  head: () => visitorRouteHead('/pricing'),
  component: PricingPage,
});

function PricingPage() {
  return useBrokersOnly() ? <PublicProfileShell hero><BrokersPricing /></PublicProfileShell> : <Navigate to="/wallet" replace />;
}
