import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listContactsTool from "./tools/list-contacts";
import listPropertiesTool from "./tools/list-properties";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "realtyz-ai",
  title: "Realtyz AI+",
  version: "0.1.0",
  instructions:
    "Tools for Realtyz AI+, a real-estate CRM. Use `list_contacts` to search the signed-in user's workspace contacts and `list_properties` to browse their properties. Data is limited to the caller's workspace.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listContactsTool, listPropertiesTool],
});
