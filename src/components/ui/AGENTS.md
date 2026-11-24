# Shared loading presentation
- Loading providers inherit suppression from the account/route boundary; guests and admin returns never register a splash, and welcome slides suppress nested result loading. Why: loading must not hide onboarding or interrupt cached navigation.
- FullPageLoading registers page-level and empty-property-results loading with a persistent centered overlay; inline indicators and populated refreshes remain ordinary. Why: fallback handoffs preserve the configured minimum without blocking local actions.
- The overlay mounts only after loading passes the one-second threshold in src/lib/pageLoadingDuration.ts, so sub-second loads never flash it; once shown, the configured minimum still applies. Why: instant transitions for fast pages without shortening the hold.
- Multi-select lists use src/components/ui/multi-select-controls.tsx. Why: consistency.
