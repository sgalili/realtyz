

# Plan: Mirror Kalpiz Design + Full Feature Parity + Super-Admin Console

## 1. Theme & Design Overhaul (Mirror Kalpiz exactly)

Replace navy+gold dark theme with Kalpiz's clean light theme.

**`src/index.css` — new tokens:**
- `--background: 210 20% 98%` (near-white)
- `--foreground: 215 25% 15%` (dark slate)
- `--primary: 213 70% 45%` (Kalpiz blue) + `--primary-foreground: 0 0% 100%`
- `--card: 0 0% 100%` (pure white surfaces)
- `--muted: 210 14% 93%` · `--accent: 213 60% 92%`
- `--sidebar-background: 215 28% 14%` (dark navy sidebar — kept)
- `--sidebar-primary: 213 70% 55%` (blue active highlights)
- Fonts: `Assistant` + `Inter` (Hebrew-first), default body `font-sans`
- Keep RTL `direction: rtl` on `<html>`

**Drop:** `btn-gold` shimmer, navy glassmorphism, gold rings, wave dividers, `gold-shimmer` text. Buttons revert to flat shadcn defaults with blue primary.

**Update:** `tailwind.config.ts` — remove `gold`, `gradient-navy-hero`, `shadow-gold*`, `kalpiz-pulse` keyframe. Keep `fade-in`, `scale-in`, `accordion-*`.

**Components to restyle:**
- `Button` → revert to default shadcn variants (no gold/navy custom variants)
- `Card` → flat white with `border-border/50` (matches Kalpiz)
- `AppLayout` → light header (white/card bg), search input on `bg-muted/50`, blue notification dot
- `AppSidebar` → dark navy sidebar, blue active state, simple "K" logo mark + "Kalpiz AI" wordmark (drop the heavy PNG wordmark)
- `Index.tsx` (Dashboard) → rebuild as Kalpiz's clean 4-stat grid + BarChart (7-day growth) + PieChart (interest distribution) + 2 lists (recent voters / active campaigns)
- All other pages (CRM, Inbox, Campaigns, etc.) → strip glass/gold classes, use flat cards

## 2. Sidebar — Keep all 17 routes, visually grouped

Convert flat sidebar to **4 collapsible groups** using `SidebarGroup` + `SidebarGroupLabel`:

```text
תפעול (Operations)
├── לוח בקרה            /
├── ניהול בוחרים        /voter-crm
├── ייבוא המוני          /massive-import
└── תיבת הודעות         /inbox

תקשורת (Communication)
├── שיחות חיות          /live-conversations
├── מחולל תוכן AI       /ai-content
├── קמפיינים            /campaigns
├── אסטרטגיית קמפיין    /campaign-strategy
└── סימולטור SMS        /sms-blast

ניתוח (Analytics)
├── סנטימנט             /sentiment
├── אנליטיקת שיחות     /conversation-analytics
└── מנוי                /subscription

ניהול (Admin) — gated
├── הגדרות API          /api-settings        [admin+]
├── אבטחה               /security            [admin+]
├── לידים                /leads               [admin+]
└── סופר-אדמין          /super-admin         [super_admin only — NEW]
```

Election-type switcher kept in header.

## 3. Backend — Add `super_admin` role + admin tables

**Migration:**
```sql
ALTER TYPE app_role ADD VALUE 'super_admin';

-- Seed sgalili@gmail.com as super_admin once user exists
-- (run after auth.users has the row; safe upsert)
INSERT INTO user_roles (user_id, role)
SELECT id, 'super_admin'::app_role FROM auth.users
WHERE email = 'sgalili@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- Helper: super_admin implies admin
CREATE OR REPLACE FUNCTION public.is_admin_or_above(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT has_role(_uid,'admin') OR has_role(_uid,'super_admin')
$$;

-- Profile mirror for the super-admin user-list view
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text, full_name text, avatar_url text,
  last_sign_in_at timestamptz, created_at timestamptz DEFAULT now(),
  is_suspended boolean DEFAULT false
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own profile" ON profiles FOR SELECT USING (auth.uid()=id);
CREATE POLICY "Super admins read all" ON profiles FOR SELECT USING (has_role(auth.uid(),'super_admin'));
CREATE POLICY "Super admins update all" ON profiles FOR UPDATE USING (has_role(auth.uid(),'super_admin'));

-- Trigger: auto-create profile on signup
CREATE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.profiles(id,email,full_name) VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Social connector credentials (admin-managed, encrypted as JSON)
CREATE TABLE public.social_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL UNIQUE,         -- whatsapp_green, whatsapp_wba, telegram, instagram, facebook, x, tiktok, youtube
  display_name text NOT NULL,
  credentials jsonb NOT NULL DEFAULT '{}',
  is_connected boolean DEFAULT false,
  last_test_at timestamptz, last_test_status text,
  created_by uuid, updated_at timestamptz DEFAULT now()
);
ALTER TABLE social_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage social" ON social_connections FOR ALL TO authenticated
  USING (is_admin_or_above(auth.uid())) WITH CHECK (is_admin_or_above(auth.uid()));
```

## 4. Super-Admin Console (NEW page `/super-admin`)

Gated by `has_role(uid,'super_admin')`. Three tabs:

- **Users** — table of all `profiles` with: email, full name, last sign-in, roles (badges), status. Actions per row: assign/remove role (admin/moderator/user), suspend/unsuspend, view audit trail. Search + filter.
- **Activity** — live feed from `audit_logs` (already exists), filter by actor.
- **System Health** — totals: voters, messages, campaigns, active connections; cron of last edge-function calls (read from `audit_logs` action prefixes).

## 5. Social & WhatsApp Connect Page (`/api-settings` upgrade)

Reuse existing API Settings page; add a **"Social Connections"** tab with one card per platform (icon + name + status pill + connect/edit dialog). Credentials stored in `social_connections.credentials` (JSONB, RLS-gated to admin+).

| Platform | Required fields | Test action |
|---|---|---|
| WhatsApp – Green API | instance_id, token | call instanceState |
| WhatsApp – Official (WBA) | phone_number_id, access_token | GET /me |
| Telegram | bot_token | getMe |
| Instagram Graph | ig_user_id, access_token | GET /me |
| Facebook Page | page_id, page_token | GET /me |
| X (Twitter) | consumer_key/secret, access_token/secret | GET users/me |
| TikTok | client_key, client_secret, access_token | GET user/info |
| YouTube | api_key OR oauth_token | channels?mine=true |

Single edge function `test-social-connection` dispatches by platform. WhatsApp Green API + WBA stay live (already wired). Others store + test only — clearly labeled "Test only".

## 6. Page-by-page restyle pass

For each page (`VoterCRM`, `OmnichannelInbox`, `AIContentGenerator`, `CampaignManager`, `CampaignStrategy`, `SentimentDashboard`, `SmsBlastSimulator`, `ConversationAnalytics`, `LiveConversations`, `MassiveImporter`, `SubscriptionManager`, `SecurityDashboard`, `AdminLeads`, `Auth`, `ResetPassword`, `NotFound`):
- Remove `glass-card`, `btn-gold`, `gold-*`, `divider-wave`, `bg-gradient-navy-hero`
- Replace with `bg-card border border-border/50` for surfaces
- Buttons: default variant for primary, `outline` for secondary
- Headings: `text-2xl font-bold tracking-tight` + muted subtitle (Kalpiz pattern)
- Drop `<SectionDivider />` usage (or convert to thin `<Separator />`)
- Drop heavy dashboard widgets (`VictoryGauge`, `Bar3DChart`, etc.) from Index — keep them as optional components but not wired

## 7. Memory updates

- Rewrite `mem://style/visual-identity` → "Kalpiz: clean light blue-on-white, dark navy sidebar, no gold."
- Add `mem://features/super-admin-console` → bootstrap user, capabilities.
- Add `mem://features/social-connectors` → table + edge function pattern.

## Files to touch

**New:** `supabase/migrations/<ts>_super_admin_and_social.sql`, `src/pages/SuperAdmin.tsx`, `src/components/social/SocialConnectionCard.tsx`, `src/components/social/SocialConnectionsTab.tsx`, `supabase/functions/test-social-connection/index.ts`, `src/hooks/useUserRole.tsx`

**Rewrite:** `src/index.css`, `tailwind.config.ts`, `src/components/AppLayout.tsx`, `src/components/AppSidebar.tsx`, `src/pages/Index.tsx`, `src/components/ui/button.tsx`, `src/components/ui/card.tsx`, `src/App.tsx` (add `/super-admin` route)

**Light pass (strip gold/glass classes):** all 16 other pages.

## Order of execution

1. Migration (super_admin enum, profiles, social_connections, seed sgalili@gmail.com)
2. Theme tokens + Tailwind config + Button/Card revert
3. AppLayout + AppSidebar (grouped 17-item nav, light header, dark sidebar)
4. Dashboard (`Index.tsx`) — Kalpiz mirror
5. Super-Admin page + role hook + route guard
6. Social Connections tab inside `/api-settings` + edge function
7. Sweep remaining pages, strip gold/glass classes
8. Update memory

