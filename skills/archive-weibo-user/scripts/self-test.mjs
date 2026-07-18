import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { checkpointRun, finishRun, mergePosts, outputPaths, startRun, verifyArchive } from './archive-store.mjs';

const outputDir = await mkdtemp(path.join(os.tmpdir(), 'archive-weibo-user-'));
const account = { uid: '123456', name: '测试用户' };

try {
  const first = await mergePosts({
    outputDir,
    ...account,
    posts: [
      { id: 'newer', publishedAt: '2025-02-02 10:00:00', content: '第二条', url: 'https://weibo.com/123456/newer' },
      { id: 'older', publishedAt: '2025-01-01 09:00:00', content: '第一条', url: 'https://weibo.com/123456/older' },
    ],
  });
  assert.deepEqual(first, { added: 2, updated: 0, unchanged: 0, total: 2 });
  await startRun({ outputDir, mode: 'full', totalPages: 1, reportedPostCount: 2 });
  await checkpointRun({ outputDir, page: 1, totalPages: 1, reportedPostCount: 2, scannedDelta: 2, addedDelta: 2, updatedDelta: 0 });
  const resumed = await startRun({ outputDir, mode: 'full', totalPages: 1, reportedPostCount: 2 });
  assert.equal(resumed.nextPage, 2);
  await assert.rejects(() => finishRun({ outputDir, mode: 'full' }), /未取得时间线终点证据/);
  await finishRun({ outputDir, mode: 'full', terminalReached: true });

  const second = await mergePosts({
    outputDir,
    ...account,
    posts: [
      { id: 'newer', publishedAt: '2025-02-02 10:00:00', content: '第二条（已编辑）', url: 'https://weibo.com/123456/newer' },
      { id: 'latest', publishedAt: '2025-03-03 11:00:00', content: '第三条', url: 'https://weibo.com/123456/latest' },
    ],
  });
  assert.deepEqual(second, { added: 1, updated: 1, unchanged: 0, total: 3 });
  await startRun({ outputDir, mode: 'incremental', totalPages: 1, reportedPostCount: 3 });
  await checkpointRun({ outputDir, page: 1, totalPages: 1, reportedPostCount: 3, scannedDelta: 7, addedDelta: 1, updatedDelta: 1 });
  await finishRun({ outputDir, mode: 'incremental', hitKnownBoundary: true });

  const files = outputPaths(outputDir, account.name);
  const markdown = await readFile(files.markdown, 'utf8');
  assert.match(markdown, /\| 1 \| 2025-01-01 09:00:00 \| 第一条 \|/);
  assert.match(markdown, /\| 2 \| 2025-02-02 10:00:00 \| 第二条（已编辑） \|/);
  assert.match(markdown, /\| 3 \| 2025-03-03 11:00:00 \| 第三条 \|/);

  const beforeExcel = await verifyArchive(outputDir);
  assert.equal(beforeExcel.ok, false);
  assert.equal(beforeExcel.excelExists, false);
  await writeFile(files.excel, 'test');
  await writeFile(path.join(outputDir, '.state', 'excel-verification.json'), JSON.stringify({ rowCount: 3, formulaErrorsFound: false }));
  const afterExcel = await verifyArchive(outputDir);
  assert.equal(afterExcel.ok, true);
  assert.equal(afterExcel.postCount, 3);
  console.log('archive-weibo-user self-test: OK');
} finally {
  await rm(outputDir, { recursive: true });
}
