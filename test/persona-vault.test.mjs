import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { importWechatArchive, importWeiboArchive } from '../src/importers.mjs';
import { createVault, loadVault, verifyVault } from '../src/vault.mjs';

async function fixtureRoot(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'personavault-'));
  t.after(() => import('node:fs/promises').then(({ rm }) => rm(root, { recursive: true })));
  return root;
}

test('imports Weibo idempotently and updates content under a stable ID', async t => {
  const root = await fixtureRoot(t);
  const vaultDir = path.join(root, 'vault');
  const archiveDir = path.join(root, 'weibo');
  await mkdir(path.join(archiveDir, '.state'), { recursive: true });
  await createVault({ outputDir: vaultDir, name: 'Example Thinker' });
  const state = {
    version: 1,
    account: { uid: '10001', name: 'Example Thinker' },
    fullSyncCompleted: true,
    reportedPostCount: 2,
    posts: {
      a: { id: 'a', publishedAt: '2025-01-01T00:00:00.000Z', content: 'First post', url: 'https://example.invalid/a', capturedAt: '2025-01-02T00:00:00.000Z' },
      b: { id: 'b', publishedAt: '2025-01-03T00:00:00.000Z', content: 'Second post', url: 'https://example.invalid/b', capturedAt: '2025-01-04T00:00:00.000Z' }
    },
    lastRun: { mode: 'full', scanned: 2, terminalReached: true, finishedAt: '2025-01-04T00:00:00.000Z' },
    activeRun: null,
    updatedAt: '2025-01-04T00:00:00.000Z'
  };
  const stateFile = path.join(archiveDir, '.state', 'archive.json');
  await writeFile(stateFile, JSON.stringify(state));

  const first = await importWeiboArchive({ vaultDir, archiveDir });
  assert.deepEqual({ added: first.added, updated: first.updated, unchanged: first.unchanged }, { added: 2, updated: 0, unchanged: 0 });
  const second = await importWeiboArchive({ vaultDir, archiveDir });
  assert.deepEqual({ added: second.added, updated: second.updated, unchanged: second.unchanged }, { added: 0, updated: 0, unchanged: 2 });

  state.posts.b.content = 'Second post, edited';
  state.lastRun = { mode: 'incremental', scanned: 2, hitKnownBoundary: true, finishedAt: '2025-01-05T00:00:00.000Z' };
  await writeFile(stateFile, JSON.stringify(state));
  const third = await importWeiboArchive({ vaultDir, archiveDir });
  assert.deepEqual({ added: third.added, updated: third.updated, unchanged: third.unchanged }, { added: 0, updated: 1, unchanged: 1 });
  assert.equal((await verifyVault(vaultDir)).ok, true);
});

test('imports exported and unavailable WeChat articles without inventing content', async t => {
  const root = await fixtureRoot(t);
  const vaultDir = path.join(root, 'vault');
  const archiveDir = path.join(root, 'wechat');
  await mkdir(path.join(archiveDir, 'articles'), { recursive: true });
  await createVault({ outputDir: vaultDir, name: 'Example Thinker' });
  await writeFile(path.join(archiveDir, 'articles', 'one.md'), '# A useful article\n\nLong-form content.\n');
  await writeFile(path.join(archiveDir, 'manifest.json'), JSON.stringify({
    account: { alias: 'gh_example', nickname: 'Example Thinker' },
    listCompleted: true,
    reportedMessageCount: 2,
    generatedAt: '2025-02-03T00:00:00.000Z',
    articles: [
      { key: 'one', aid: '1', title: 'A useful article', author: 'Editorial', publishedAt: '2025-02-01T00:00:00.000Z', sourceUrl: 'https://example.invalid/1', status: 'exported', file: 'articles/one.md', imageCount: 0, processedAt: '2025-02-03T00:00:00.000Z' },
      { key: 'two', aid: '2', title: 'An unavailable article', publishedAt: '2025-02-02T00:00:00.000Z', sourceUrl: 'https://example.invalid/2', status: 'unavailable', error: 'No longer available', processedAt: '2025-02-03T00:00:00.000Z' }
    ]
  }));

  const result = await importWechatArchive({ vaultDir, archiveDir });
  assert.equal(result.added, 2);
  const vault = await loadVault(vaultDir);
  assert.equal(vault.items['wechat:gh_example:1'].status, 'captured');
  assert.equal(vault.items['wechat:gh_example:2'].status, 'unavailable');
  assert.equal(vault.items['wechat:gh_example:2'].content, '');
  assert.equal((await verifyVault(vaultDir)).ok, true);
  assert.match(await readFile(path.join(vaultDir, 'exports', 'timeline.md'), 'utf8'), /A useful article/);
});

test('ships a parseable schema with canonical source, item, and run definitions', async () => {
  const schema = JSON.parse(await readFile(new URL('../schema/persona-vault.schema.json', import.meta.url), 'utf8'));
  assert.equal(schema.properties.version.const, 1);
  assert.deepEqual(Object.keys(schema.$defs).sort(), ['item', 'run', 'source']);
  assert.match(schema.$defs.item.properties.checksum.pattern, /64/);
});
