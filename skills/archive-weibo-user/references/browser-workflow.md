# Browser collection workflow

## Setup and identity

1. Load the Browser skill and connect to `https://weibo.com/`.
2. Resolve the target through `https://s.weibo.com/user?q=<encoded nickname>`. Verify the numeric UID, nickname, and identifying profile text.
3. Open `https://weibo.cn/u/<uid>`. If redirected to login, switch to 扫码登录, show the browser, and ask the user to scan with the Weibo app. Reuse the authenticated session. Do not inspect cookies or storage.
4. Navigate to `https://weibo.cn/u/<uid>?filter=0&page=1`. Confirm the page title `<昵称>的微博`, `微博[总数]`, and `1/总页数页`. Keep `filter=0`; `filter=1` excludes reposts.

## Start or resume

Import the deterministic helpers once in the persistent Node session:

```js
var archiveStore = await import("/absolute/path/archive-weibo-user/scripts/archive-store.mjs");
var weiboCn = await import("/absolute/path/archive-weibo-user/scripts/weibo-cn.mjs");
```

Create the state with `ensureArchive(...)`. Use `full` when `fullSyncCompleted` is false; otherwise use `incremental`. Call `startRun(...)` with the visible page count and reported post count. If an `activeRun` of the same mode exists, resume at its `nextPage`.

## Collect and checkpoint

For each page, call:

```js
const pageResult = await weiboCn.collectPage({
  tab,
  detailTab,
  uid,
  name,
  page,
  referenceDate: new Date(),
});
```

`collectPage` validates the identity and page number, parses exact dates, follows `全文` links, preserves repost reasons and quoted source text, and emits stable post IDs.

Checkpoint only after the whole page is complete:

```js
const merged = await archiveStore.mergePosts({ outputDir, uid, name, posts: pageResult.posts });
await archiveStore.checkpointRun({
  outputDir,
  page,
  totalPages: pageResult.totalPages,
  reportedPostCount: pageResult.reportedPostCount,
  scannedDelta: pageResult.posts.length,
  addedDelta: merged.added,
  updatedDelta: merged.updated,
});
```

Keep a gentle delay between list pages. On interruption, read `activeRun.nextPage` and resume; do not delete the archive.

## Full completion

Continue through the visible final page. Require all of these before finishing:

- the requested page equals the page's visible total page count;
- `terminalReached` from `collectPage` is true;
- every page through the visible terminal page has been checkpointed without an unresolved failure.

Then call `finishRun({ outputDir, mode: "full", terminalReached: true })`.

Report the profile header count and unique accessible archive count separately when they differ. Do not invent IDs for posts that the timeline no longer lists.

## Incremental completion

Load the known ID set before page 1. Pinned posts do not count toward the stop boundary. Process newest to oldest until five consecutive known, non-pinned IDs appear after all new posts have been captured. Checkpoint the partial page before calling `finishRun({ mode: "incremental", hitKnownBoundary: true })`.

## Build Excel with the bundled runtime

Use `load_workspace_dependencies` to obtain the bundled Node executable and `node_modules`. Work in a fresh temporary directory, symlink its `node_modules` to the provided dependency directory, copy `scripts/build-output.mjs` into that directory, and run the copied builder with `--output <archive directory>`. Do not install or substitute spreadsheet libraries.

Run `await archiveStore.verifyArchive(outputDir)` after Excel export. Inspect all QA renders under `.state/qa/` with `view_image`; fix severe clipping or illegibility before reporting success.
