import { createFileRoute } from "@tanstack/react-router";
import { CommandCenter, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/command-center")({
  head: () => ({ meta: [{title:'TORAFF | מטלות'}, {name:'description',content:'ניהול מטלות, סיורים וסיכומי שיחות במשרד.'}, {property:'og:title',content:'TORAFF | מטלות'}, {property:'og:description',content:'מטלות, סיורים וסיכומי שיחות במקום אחד.'}, {property:'og:type',content:'website'}, {name:'twitter:card',content:'summary'}] }),
  component: () => (
    <ProtectedRoute allowGuestDemo><CommandCenter /></ProtectedRoute>
  ),
});
