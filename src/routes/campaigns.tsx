import { createFileRoute } from "@tanstack/react-router";
import { CampaignCenter, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/campaigns")({
  head: () => ({ meta: [{title:'TORAFF | קמפיינים'}, {name:'description',content:'קמפיינים, פרסומים וקבוצות של המשרד.'}, {property:'og:title',content:'TORAFF | קמפיינים'}, {property:'og:description',content:'מעקב אחר קמפיינים ופרסומים.'}, {property:'og:type',content:'website'}, {name:'twitter:card',content:'summary'}] }),
  component: () => (
    <ProtectedRoute allowGuestDemo><CampaignCenter /></ProtectedRoute>
  ),
});
