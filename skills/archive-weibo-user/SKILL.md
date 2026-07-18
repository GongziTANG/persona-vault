---
name: archive-weibo-user
description: Archive all accessible historical posts from one Weibo user into resumable, verified Markdown and Excel outputs with automatic incremental updates. Use when Codex is asked to 导出微博、抓取某个人的所有历史微博、归档个人微博、把微博整理成 Markdown 或 Excel、增量更新微博归档、续传微博下载, or archive a Weibo account by nickname, profile URL, or UID.
---

# Archive a Weibo user's posts

Build an evidence-backed archive of the target user's accessible posts. Treat the stable UID, `.state/archive.json`, `manifest.json`, and `verification.json` as the source of truth. Never infer completeness from a successful command alone.

## Preflight

1. Resolve the profile UID from the supplied URL or Weibo user search. Verify both the requested nickname and profile identity; a nickname alone is not proof.
2. Use an absolute output directory. If none is supplied, use `~/Downloads/微博归档/<昵称>`.
3. Read [references/browser-workflow.md](references/browser-workflow.md) before collecting posts. Read [references/recovery.md](references/recovery.md) when login, pagination, long text, rate limits, or verification fails.
4. Use the Browser skill for Weibo UI access. Prefer the stable paginated `weibo.cn/u/<uid>?filter=0&page=N` timeline after login. Never inspect, copy, log, or save browser cookies, tokens, local storage, passwords, or verification codes.

## Choose the run mode

- When `.state/archive.json` does not exist, run a **full sync** from the newest post to the platform's terminal end state.
- When it exists and its UID matches, run an **incremental sync**. Scan from the newest post until five consecutive known, non-pinned posts are observed after all newer posts have been captured. Do not stop on the first known post because it may be pinned.
- Refuse to reuse a state directory whose UID differs from the requested target.

## Checkpoint every batch

Import `scripts/archive-store.mjs` and `scripts/weibo-cn.mjs` in the persistent Node browser session. Collect one paginated page at a time with `collectPage(...)`, resolve every `全文` detail, call `mergePosts(...)`, then call `checkpointRun(...)`. The store writes `.state/archive.json`, the Markdown archive, and `manifest.json` atomically after each batch.

Use the Weibo post ID or permalink code as the deduplication key. Preserve edited content under the same ID. Keep posts sorted oldest to newest so sequence numbers remain stable and new posts append.

## Finish with evidence

For a full sync, require the final requested page to equal the visible `current/total页` value. Set `terminalReached: true` only then. Record and report any gap between the unique accessible archive and the profile header's `微博[总数]`; the header can include posts the paginated timeline no longer returns. For an incremental sync, set `hitKnownBoundary: true` only after the five-known-post boundary is satisfied. Unknown UI failures, login walls, and rate limits are retryable failures, not completion.

Call `finishRun(...)`, then use the bundled spreadsheet runtime to run `scripts/build-output.mjs` as described in the browser workflow. Run `verifyArchive(...)` last.

Require all of the following before reporting completion:

- The target UID matches.
- The first full sync has `fullSyncCompleted: true`.
- The latest run has the appropriate terminal or known-boundary evidence.
- Duplicate IDs, missing IDs, invalid dates, and empty content counts are zero.
- Markdown and Excel row counts equal the manifest accessible-post count.
- Spreadsheet inspection and visual rendering pass.

Report the run mode, scanned/new/updated/total counts, date range, verification result, and both final output files. Describe inaccessible or deleted posts as unavailable to the current session, never as successfully archived.
