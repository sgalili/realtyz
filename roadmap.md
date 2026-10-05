# Roadmap
- [ ] Isolate Facebook page sync by workspace, acknowledge extension delivery before tab cleanup, and validate initiating workspace binding with regression checks.

- [x] Unify campaign metadata in one ordered nonwrapping row, strengthen nested subpost boundaries, restore per-group statuses and provide full-name expansion; 13 tests passed and signed-in 1280/435/360px views verified ten nested subposts and full-name expansion with no overflow or runtime errors, without publication.

- [x] Expand campaign series below the main card, move repost to the row edge, derive accurate statuses and truncate single group names; eight tests passed, build OK, signed-in desktop/mobile expansion and collapse verified with ten series cards, no overflow or runtime errors, without publication.

- [x] Show megaphone repost action, icon-first single group or collapsed multi-group count opposite logo/date, and remove the main-card expansion arrow; verified signed-in desktop/mobile header, portaled counter details, no horizontal overflow/errors and five passing tests.

- [x] Harden individual and select-all group selection with immutable guarded updates and one activation per row; verified signed-in desktop/mobile repeated toggles and cancellation, no runtime exceptions, and five passing regression tests without publication.

- [x] Replace group counters with unframed names and adjacent status icons; remove perpetual and redundant card loaders. Verified signed-in cards, series overlay, mobile layout and seven regression tests without Facebook publication.

- [x] Clean expanded groups and remove the repost title field.
- [x] Preserve clean text and configured first-comment link selections without misrepresenting Rita.
- [x] Fix and verify multi-selection layout on campaigns.

- [x] Open continuation/repost in the full editor with editable settings and safe explicit resubmission.
- [x] Align cancellation right beside publication confirmation and verify signed-in edits, cancellation, future-scheduled save/readback and cleanup without Facebook publication.

- [x] Preserve successful post status with subtle first-comment warnings.
- [x] Keep card order stable and collapse related campaign posts into master cards.
- [x] Use text-only group count pills, standardize בתור, and prefer direct post URLs with group-page fallback.

- [x] Replace Rita's property promotion picker with persistent group topics feeding AI generation; retain the existing property picker for other workspaces.

- [x] Clean existing duplicate post images and prevent duplication during fetching, saving, and rendering.

- [x] Permanently delete posts and associated queued jobs with verified results.
- [x] Offer current-post or entire-series deletion for master posts.

- [x] Keep campaign/post card titles and content stable between explicit edits.

- [x] Enable horizontal scrolling for the affiliate table on mobile and preview.
- [x] Add permanent single and bulk property deletion with workspace-safe authorization.
- [x] Show property selection controls only while multi-select mode is active.
- [x] Remove the icon beside הערות משרד.
- [x] Open public property cards on their dedicated property page.
- [x] Add the public property-card share menu beside the active contact action.
- [x] Keep RTL search icons clear of placeholder text.
- [x] Place the master property selector immediately right of the search field.

## Facebook fixes (2026-09-25)
- [x] Rita auto-replies on Messenger/Instagram DMs
- [x] Scheduled group posts wait in the extension queue until the chosen time
- [x] Page connect subscribes the Page to Messenger/comment webhooks + asks pages_manage_metadata/pages_messaging
- [ ] Reconnect both Facebook Pages (blocked: owner must reconnect; current tokens can't enable delivery)

## Group pills and posting continuation
- [x] Lock group-pill/dropdown geometry and open single-group links directly.
- [x] Add confirmed workspace-safe continuation/resubmission preserving original job data and schedule.
- [x] Verify layout and confirmation on the signed-in workspace; test retry/resubmit with mocked jobs, without live Facebook publication.
