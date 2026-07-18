# Recovery and verification

## Identity

- Treat an exact nickname as a search candidate only. Lock the target by numeric UID and verify profile text or another stable identity signal.
- Never reuse an output directory when the stored UID differs.

## Login and rate limits

- Reuse the signed-in browser session. If it expires, return to the login page without deleting `.state/archive.json`.
- Keep checkpoints on login walls, congested pages, CAPTCHA, request throttling, or unknown UI failures. Resume from the last batch.
- Ask before solving any CAPTCHA. Never classify rate limiting as timeline completion.

## Pagination

- Always use `filter=0` for all posts; `filter=1` is originals only.
- Lock the visible `微博[总数]` and `current/total页` evidence from `weibo.cn`.
- Weibo can pin an old post above newer posts. Do not stop an incremental run at the first known ID.
- Full completion needs the visible final page and every preceding page checkpointed. A fixed number of pages or unchanged content alone is insufficient. Record a profile-count gap separately because the header can include posts the timeline no longer returns.
- Weibo may render the visible final page with zero cards. Accept it only when the requested page, current page, and visible total page are equal and every preceding page is checkpointed; otherwise treat an empty page as retryable failure.

## Content

- Resolve every `全文` link before checkpointing its page. If detail retrieval fails, leave the page uncheckpointed and retry it.
- Preserve forwarded text and quoted original content when rendered. Preserve paragraph breaks.
- Use only a stable post ID or permalink code for deduplication. Do not deduplicate by date or text.
- Store an edited post under the same ID and report it as updated, not new.

## Completion checks

Require zero duplicate IDs, zero invalid dates, zero empty content, Markdown rows equal to manifest count, Excel present with the same row count, and visual QA renders that are legible. Deleted and access-restricted posts are outside the accessible archive unless their IDs were previously captured; do not silently invent or relabel them.
