import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { PageLoader, ProtectedRoute, Wallet } from "@/app/AppRoutes";

export const Route = createFileRoute("/wallet")({
  head: () => ({ meta: [{title:'TORAFF | הארנק'}, {name:'description',content:'יתרת הקרדיטים, פירוט חיובים והיסטוריית הפקדות.'}, {property:'og:title',content:'TORAFF | הארנק'}, {property:'og:description',content:'פירוט חיובים והפקדות בארנק.'}, {property:'og:type',content:'website'}, {name:'twitter:card',content:'summary'}] }),
  component: () => (
    <ProtectedRoute><Suspense fallback={<PageLoader />}><Wallet /></Suspense></ProtectedRoute>
  ),
});
