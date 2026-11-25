import { createFileRoute } from "@tanstack/react-router";
import { ListingsRoute, Properties, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/properties/")({
  head: () => ({ meta: [{title:'TORAFF | הנכסים שלי'}, {name:'description',content:'נכסי המשרד, תמונות ופרטי נכסים מלאים.'}, {property:'og:title',content:'TORAFF | הנכסים שלי'}, {property:'og:description',content:'תמונות ופרטי נכסי המשרד.'}, {property:'og:type',content:'website'}, {name:'twitter:card',content:'summary'}] }),
  component: () => (
    <ListingsRoute><ProtectedRoute allowGuestDemo><Properties /></ProtectedRoute></ListingsRoute>
  ),
});
