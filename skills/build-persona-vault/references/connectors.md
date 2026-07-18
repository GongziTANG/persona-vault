# Connector routing

## WeChat public accounts

Use `$mpvault-archive` when it is installed. Lock the account by original ID, not display name. Require a completed list, zero failed or pending records, valid local article files and images, and `verification.json` with `ok: true` before importing.

PersonaVault imports the MPVault `manifest.json` and reads each exported Markdown file. Deleted and unavailable articles remain evidence-only items. Failed and pending items remain failures; never relabel them as unavailable.

## Weibo users

Use `$archive-weibo-user` when it is installed. Lock the account by UID. The first run scans through the visible terminal page. Later runs scan newest-first until five consecutive known, non-pinned posts establish the incremental boundary.

PersonaVault imports `.state/archive.json`. Preserve the connector's Markdown and Excel as source-specific deliverables. The unified vault produces a cross-platform timeline separately.

## Additional platforms

Normalize a new connector only after it can provide:

- a stable platform account ID;
- a stable source item ID;
- a published timestamp or an explicit unavailable state;
- captured content or an honest terminal/failure state;
- resumable sync evidence;
- a connector verification report.

Do not make the shared core log in to a platform or parse its UI.
