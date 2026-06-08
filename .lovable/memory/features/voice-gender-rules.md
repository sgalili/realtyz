---
name: Voice & Hebrew Gender Rules
description: Profiles.gender + cloned_voices.voice_gender drive Hebrew grammar in UI and voice calls; AI must self-refer with voice clone's gender and address user with their gender — set both before the call and never switch mid-conversation.
type: feature
---

- `profiles.gender` (text: 'male'|'female'|null) — broker's grammatical gender. Use it to render Hebrew verbs/adjectives addressing the broker (UI text, AI replies). Helper: `heVerb(gender, male, female)` in CampaignCenter.
- `cloned_voices.voice_gender` (text: 'male'|'female'|null) — gender of the cloned voice persona. Preset voices encode gender in their PRESET_VOICE_AGENTS array (sarah/matilda=female, charlie=male). For Udi Whitman's clone: MALE.
- `vapi-outbound-call` body accepts `voice_gender`, `user_gender`, `voice_id`, `listing_id`, `instructions`. It injects `genderRules()` into the system prompt forcing the AI to self-refer in the voice clone's gender and address the lead in their gender for the entire call.
- Voice picker dialog has a broker-gender toggle at the top that writes to `profiles.gender`. Property focus dropdown in step 3 mirrors the FB-post listing picker.
- HARD RULE: never assume a male voice clone (e.g. Udi) is female or vice versa. The AI must determine gender BEFORE speaking and stick to it for the entire call.
