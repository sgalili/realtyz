---
name: Navy & Gold Brand System
description: Kalpiz dashboard navy+gold tokens, glass cards, btn-gold shimmer, wave dividers, election-type terminology synced with kalpiz.co.il landing.
type: design
---
**Brand tokens (HSL, in `src/index.css`)**
- `--primary: 224 100% 18%` (#001d5e — Kalpiz Navy, exact landing match)
- `--primary-glow: 224 100% 27%` (#002a8a — landing mid-stop)
- `--gold: 48 96% 53%` (#FACC15) · `--gold-deep: 43 74% 49%` (#D4AF37)
- `--card: 224 80% 11%` navy glass surface · `--background: 224 100% 6%`
- `--ring: 48 96% 53%` (gold focus rings everywhere)
- Gradients: `--gradient-navy-hero` (matches landing hero) and `--gradient-gold` for CTAs.

**Required usage**
- Primary action buttons → `<Button>` default = `btn-gold` (shimmer animation auto-applied). Use `variant="navy"` for secondary, `variant="outline"` for tertiary.
- All dashboard surfaces → `<Card variant="glass">` (default) or `variant="active"` (gold-glow border for KPIs / demo war-room).
- Section breaks → `<SectionDivider />` (gold wave SVG) instead of flat `<Separator/>`.
- Headings → `font-black` (900) with `heading-display` class or `gold-shimmer` gradient text for hero titles.

**Sidebar/Header**
- Sidebar uses `kalpiz-wordmark.png` (white "Kalpiz") with gold drop-shadow; collapsed state shows gold "K".
- Active nav item: gold text, gold icon glow, inset gold left-border (`!shadow-[inset_2px_0_0_hsl(var(--gold))]`).
- Header has `<ElectionTypeSwitcher />` and gold-tinted SidebarTrigger.

**Election terminology — single source of truth**
- `useElectionType()` provider in `src/hooks/useElectionType.tsx`, persisted in localStorage.
- Always render dynamic Hebrew terms via `terms.voters` / `terms.target` / `terms.voterBook` etc. — never hardcode "מנדטים" or "ספר הבוחרים" inline.
- Switcher exists in BOTH the global header and as a setting card at the top of `/api-settings`.
