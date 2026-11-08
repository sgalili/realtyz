# Accessibility
- Use the locally bundled MIT accessibility engine without its injected UI, remote fonts or persisted session; app preferences own persistence and route-wide effects. Why: no external services or floating trigger.
- Keep menu controls in the opened sidebar footer and use Radix for nested dialog focus/Escape behavior. Why: keyboard operation without custom focus traps.
- Accessibility preferences supplement, never certify, WCAG or Israeli-standard compliance. Why: semantic/content audits and assistive-technology testing remain necessary.