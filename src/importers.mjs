import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { mergeSource } from './vault.mjs';

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function statusCounts(items) {
  return items.reduce((counts, item) => {
    counts[item.status] = (counts[item.status] || 0) + 1;
    return counts;
  }, {});
}

export async function importWeiboArchive({ vaultDir, archiveDir }) {
  const state = await readJson(path.join(archiveDir, '.state', 'archive.json'));
  const accountId = String(state.account?.uid || '').trim();
  const displayName = String(state.account?.name || '').trim();
  if (!accountId || !displayName) throw new Error('Weibo archive account identity is missing');
  const items = Object.values(state.posts || {}).map(post => ({
    platform: 'weibo',
    sourceAccountId: accountId,
    sourceItemId: String(post.id),
    type: 'post',
    content: post.content,
    publishedAt: post.publishedAt,
    sourceUrl: post.url,
    status: 'captured',
    metadata: { pinned: Boolean(post.pinned) },
    provenance: {
      capturedAt: post.capturedAt || state.updatedAt,
      sourceArchive: 'archive-weibo-user',
    },
  }));
  return mergeSource({
    outputDir: vaultDir,
    source: {
      platform: 'weibo',
      accountId,
      displayName,
      canonicalUrl: `https://weibo.com/u/${accountId}`,
      fullSyncCompleted: Boolean(state.fullSyncCompleted),
      reportedCount: state.reportedPostCount,
      accessibleCount: items.length,
      statusCounts: statusCounts(items),
    },
    items,
    run: {
      mode: state.lastRun?.mode || (state.fullSyncCompleted ? 'incremental' : 'full'),
      scanned: state.lastRun?.scanned ?? items.length,
      completed: Boolean(state.fullSyncCompleted && !state.activeRun),
      evidence: {
        terminalReached: Boolean(state.lastRun?.terminalReached),
        hitKnownBoundary: Boolean(state.lastRun?.hitKnownBoundary),
        reportedCountGap: state.reportedPostCount == null ? null : Number(state.reportedPostCount) - items.length,
      },
      finishedAt: state.lastRun?.finishedAt || state.updatedAt,
    },
  });
}

export async function importWechatArchive({ vaultDir, archiveDir }) {
  const manifest = await readJson(path.join(archiveDir, 'manifest.json'));
  const accountId = String(manifest.account?.alias || manifest.account?.fakeid || '').trim();
  const displayName = String(manifest.account?.nickname || '').trim();
  if (!accountId || !displayName) throw new Error('WeChat archive account identity is missing');

  const items = [];
  for (const article of manifest.articles || []) {
    const status = article.status === 'exported' ? 'captured' : article.status;
    let content = '';
    if (status === 'captured') {
      if (!article.file) throw new Error(`Exported WeChat article ${article.key} has no file`);
      content = await readFile(path.join(archiveDir, article.file), 'utf8');
    }
    items.push({
      platform: 'wechat',
      sourceAccountId: accountId,
      sourceItemId: String(article.aid || article.key),
      type: 'article',
      title: article.title,
      content,
      author: article.author,
      publishedAt: article.publishedAt,
      sourceUrl: article.sourceUrl,
      status,
      media: article.imageCount ? [{ type: 'image', count: Number(article.imageCount) }] : [],
      metadata: {
        listedDeleted: Boolean(article.listedDeleted),
        sourceError: article.error || null,
      },
      provenance: {
        capturedAt: article.processedAt || manifest.generatedAt,
        sourceArchive: 'mpvault',
      },
    });
  }

  return mergeSource({
    outputDir: vaultDir,
    source: {
      platform: 'wechat',
      accountId,
      displayName,
      fullSyncCompleted: Boolean(manifest.listCompleted),
      reportedCount: manifest.reportedMessageCount,
      accessibleCount: items.filter(item => item.status === 'captured').length,
      statusCounts: statusCounts(items),
    },
    items,
    run: {
      scanned: items.length,
      completed: Boolean(manifest.listCompleted && !items.some(item => ['failed', 'pending'].includes(item.status))),
      evidence: { listCompleted: Boolean(manifest.listCompleted) },
      finishedAt: manifest.generatedAt,
    },
  });
}
