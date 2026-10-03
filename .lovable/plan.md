# Full repost editor

- Open the existing full post editor from every continue/repost button, regardless of delivery status.
- Prefill content, first comment, photos, target groups and schedule from the workspace’s original post/jobs.
- Allow changes before an explicit **אישור ופרסום מחדש** action; keep **ביטול** on the right edge of the same row.
- Rename the normal publication confirmation to **אישור פרסום**.

## Technical details
- Reuse the campaign composer rather than create a second editor.
- Save edited settings and requeue selected targets through a workspace-authorized atomic operation; do not restart jobs currently being executed.
- Verify editor prefilling, changes, button placement and queue results without publishing to Facebook.