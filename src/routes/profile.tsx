import { createFileRoute } from "@tanstack/react-router";
import { Profile, ProtectedRoute } from "@/app/AppRoutes";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{title:'TORAFF | הגדרות הפרופיל'}, {name:'description',content:'הפרופיל האישי, פרטי המשרד והחיבורים.'}, {property:'og:title',content:'TORAFF | הגדרות הפרופיל'}, {property:'og:description',content:'פרטי הפרופיל והמשרד.'}, {property:'og:type',content:'website'}, {name:'twitter:card',content:'summary'}] }),
  component: () => (
    <ProtectedRoute allowGuestDemo><Profile /></ProtectedRoute>
  ),
});
