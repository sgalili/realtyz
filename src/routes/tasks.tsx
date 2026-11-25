import { createFileRoute } from "@tanstack/react-router";
import { Navigate } from "@/lib/router-compat";

export const Route = createFileRoute("/tasks")({
  head: () => ({ meta: [{title:'TORAFF | המשימות שלי'}, {name:'description',content:'מעבר למטלות המשרד ולמשימות הקרובות.'}, {property:'og:title',content:'TORAFF | המשימות שלי'}, {property:'og:description',content:'כל המשימות הקרובות במשרד.'}, {property:'og:type',content:'website'}, {name:'twitter:card',content:'summary'}] }),
  component: () => (
    <Navigate to="/command-center" replace />
  ),
});
