import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const VERSION = 1;
const STATE_RELATIVE_PATH = path.join('.state', 'archive.json');

function nowIso() {
  return new Date().toISOString();
}

function cleanText(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeDate(value) {
  const raw = cleanText(value);
  if (!raw) throw new Error('微博缺少发表日期');
  const normalized = raw.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/)
    ? `${raw.replace(' ', 'T')}${raw.length === 16 ? ':00' : ''}+08:00`
    : raw;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) throw new Error(`无法解析发表日期：${raw}`);
  return date.toISOString();
}

function sanitizeName(value) {
  return cleanText(value).replace(/[\\/:*?"<>|]/g, '_') || '微博用户';
}

function normalizePost(raw) {
  const id = cleanText(raw?.id || raw?.mid || raw?.permalinkCode);
  const content = cleanText(raw?.content);
  if (!id) throw new Error('微博缺少稳定 ID');
  if (!content) throw new Error(`微博 ${id} 正文为空`);
  return {
    id,
    publishedAt: normalizeDate(raw.publishedAt || raw.published_at || raw.date),
    content,
    url: cleanText(raw.url || raw.sourceUrl),
    pinned: Boolean(raw.pinned),
    capturedAt: nowIso(),
  };
}

async function writeAtomic(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await writeFile(temporary, text, 'utf8');
  await rename(temporary, file);
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function sortedPosts(state) {
  return Object.values(state.posts).sort((left, right) => {
    const byDate = left.publishedAt.localeCompare(right.publishedAt);
    return byDate || left.id.localeCompare(right.id);
  });
}

function markdownCell(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

function localDateTime(iso) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

export function outputPaths(outputDir, accountName) {
  const stem = `${sanitizeName(accountName)}_微博归档`;
  return {
    markdown: path.join(outputDir, `${stem}.md`),
    excel: path.join(outputDir, `${stem}.xlsx`),
    manifest: path.join(outputDir, 'manifest.json'),
    verification: path.join(outputDir, 'verification.json'),
    state: path.join(outputDir, STATE_RELATIVE_PATH),
  };
}

export async function loadArchive(outputDir) {
  return readJson(path.join(outputDir, STATE_RELATIVE_PATH));
}

export async function ensureArchive({ outputDir, uid, name }) {
  const normalizedAccount = { uid: cleanText(uid), name: cleanText(name) };
  if (!normalizedAccount.uid || !normalizedAccount.name) throw new Error('账号 UID 和昵称不能为空');
  const files = outputPaths(outputDir, normalizedAccount.name);
  try {
    const existing = await readJson(files.state);
    if (String(existing.account?.uid) !== normalizedAccount.uid) {
      throw new Error(`归档 UID 不匹配：已有 ${existing.account?.uid}，请求 ${normalizedAccount.uid}`);
    }
    return existing;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const createdAt = nowIso();
  const state = {
    version: VERSION,
    account: normalizedAccount,
    fullSyncCompleted: false,
    reportedPostCount: null,
    posts: {},
    createdAt,
    updatedAt: createdAt,
    lastRun: null,
    activeRun: null,
  };
  await persist(state, outputDir);
  return state;
}

export async function mergePosts({ outputDir, uid, name, posts }) {
  if (!Array.isArray(posts)) throw new Error('posts 必须是数组');
  const state = await ensureArchive({ outputDir, uid, name });
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  for (const raw of posts) {
    const post = normalizePost(raw);
    const existing = state.posts[post.id];
    if (!existing) {
      state.posts[post.id] = post;
      added += 1;
      continue;
    }
    const changed = existing.publishedAt !== post.publishedAt || existing.content !== post.content || existing.url !== post.url;
    state.posts[post.id] = { ...existing, ...post, firstCapturedAt: existing.firstCapturedAt || existing.capturedAt };
    if (changed) updated += 1;
    else unchanged += 1;
  }
  state.updatedAt = nowIso();
  await persist(state, outputDir);
  return { added, updated, unchanged, total: Object.keys(state.posts).length };
}

export async function startRun({ outputDir, mode, totalPages, reportedPostCount }) {
  if (!['full', 'incremental'].includes(mode)) throw new Error('mode 必须是 full 或 incremental');
  const state = await loadArchive(outputDir);
  if (mode === 'incremental' && !state.fullSyncCompleted) throw new Error('尚未完成首次全量同步，不能启动增量同步');
  if (state.activeRun?.mode === mode) return state.activeRun;
  state.activeRun = {
    mode,
    nextPage: 1,
    totalPages: Number(totalPages || 0),
    reportedPostCount: Number(reportedPostCount || 0),
    scanned: 0,
    added: 0,
    updated: 0,
    startedAt: nowIso(),
    checkpointedAt: nowIso(),
  };
  state.updatedAt = nowIso();
  await persist(state, outputDir);
  return state.activeRun;
}

export async function checkpointRun({ outputDir, page, totalPages, reportedPostCount, scannedDelta, addedDelta, updatedDelta }) {
  const state = await loadArchive(outputDir);
  if (!state.activeRun) throw new Error('没有进行中的同步任务');
  const currentPage = Number(page);
  if (!Number.isInteger(currentPage) || currentPage < 1) throw new Error('page 必须是正整数');
  state.activeRun.nextPage = Math.max(state.activeRun.nextPage, currentPage + 1);
  state.activeRun.totalPages = Number(totalPages || state.activeRun.totalPages || 0);
  state.activeRun.reportedPostCount = Number(reportedPostCount || state.activeRun.reportedPostCount || 0);
  state.activeRun.scanned += Number(scannedDelta || 0);
  state.activeRun.added += Number(addedDelta || 0);
  state.activeRun.updated += Number(updatedDelta || 0);
  state.activeRun.checkpointedAt = nowIso();
  state.updatedAt = nowIso();
  await persist(state, outputDir);
  return state.activeRun;
}

export async function finishRun({ outputDir, mode, scanned, added, updated, terminalReached = false, hitKnownBoundary = false }) {
  if (!['full', 'incremental'].includes(mode)) throw new Error('mode 必须是 full 或 incremental');
  const state = await loadArchive(outputDir);
  if (mode === 'full' && !terminalReached) throw new Error('全量同步未取得时间线终点证据');
  if (mode === 'incremental' && !hitKnownBoundary && !terminalReached) throw new Error('增量同步既未命中已知边界，也未到达时间线终点');
  if (mode === 'full') state.fullSyncCompleted = true;
  if (state.activeRun?.reportedPostCount) state.reportedPostCount = state.activeRun.reportedPostCount;
  state.lastRun = {
    mode,
    scanned: Number(scanned ?? state.activeRun?.scanned ?? 0),
    added: Number(added ?? state.activeRun?.added ?? 0),
    updated: Number(updated ?? state.activeRun?.updated ?? 0),
    terminalReached: Boolean(terminalReached),
    hitKnownBoundary: Boolean(hitKnownBoundary),
    terminalPage: state.activeRun ? state.activeRun.nextPage - 1 : null,
    visibleTotalPages: state.activeRun?.totalPages ?? null,
    finishedAt: nowIso(),
  };
  state.activeRun = null;
  state.updatedAt = nowIso();
  await persist(state, outputDir);
  return state.lastRun;
}

async function persist(state, outputDir) {
  const files = outputPaths(outputDir, state.account.name);
  const posts = sortedPosts(state);
  const markdown = [
    `# ${state.account.name}微博归档`,
    '',
    `- UID：\`${state.account.uid}\``,
    `- 微博数：${posts.length}`,
    `- 排序：最早到最新（序号稳定递增）`,
    `- 更新时间：${localDateTime(state.updatedAt)}（北京时间）`,
    '',
    '| 序号 | 发表日期 | 内容 |',
    '|---:|---|---|',
    ...posts.map((post, index) => `| ${index + 1} | ${localDateTime(post.publishedAt)} | ${markdownCell(post.content)} |`),
    '',
  ].join('\n');
  const manifest = {
    version: VERSION,
    account: state.account,
    fullSyncCompleted: state.fullSyncCompleted,
    reportedPostCount: state.reportedPostCount,
    postCount: posts.length,
    oldestPublishedAt: posts[0]?.publishedAt || null,
    newestPublishedAt: posts.at(-1)?.publishedAt || null,
    lastRun: state.lastRun,
    activeRun: state.activeRun,
    files: {
      markdown: path.basename(files.markdown),
      excel: path.basename(files.excel),
    },
    generatedAt: nowIso(),
  };
  await writeAtomic(files.state, `${JSON.stringify(state, null, 2)}\n`);
  await writeAtomic(files.markdown, markdown);
  await writeAtomic(files.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
}

export async function verifyArchive(outputDir) {
  const state = await loadArchive(outputDir);
  const files = outputPaths(outputDir, state.account.name);
  const posts = sortedPosts(state);
  const ids = posts.map(post => post.id);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  const missingIds = posts.filter(post => !post.id).map(post => post.id);
  const invalidDates = posts.filter(post => Number.isNaN(new Date(post.publishedAt).getTime())).map(post => post.id);
  const emptyContent = posts.filter(post => !cleanText(post.content)).map(post => post.id);
  const markdown = await readFile(files.markdown, 'utf8');
  const markdownRows = markdown.split('\n').filter(line => /^\| \d+ \|/.test(line)).length;
  let excelExists = false;
  try {
    excelExists = (await stat(files.excel)).isFile();
  } catch {}
  let excelVerification = null;
  try {
    excelVerification = await readJson(path.join(outputDir, '.state', 'excel-verification.json'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const excelVerified = Boolean(
    excelExists &&
    excelVerification?.rowCount === posts.length &&
    excelVerification?.formulaErrorsFound === false
  );
  const latestRunComplete = state.lastRun?.mode === 'full'
    ? state.lastRun.terminalReached
    : Boolean(state.lastRun?.hitKnownBoundary || state.lastRun?.terminalReached);
  const verification = {
    account: state.account,
    fullSyncCompleted: Boolean(state.fullSyncCompleted),
    latestRunComplete: Boolean(latestRunComplete),
    postCount: posts.length,
    reportedPostCount: state.reportedPostCount,
    countMatchesReported: state.reportedPostCount == null || posts.length === state.reportedPostCount,
    reportedCountGap: state.reportedPostCount == null ? null : state.reportedPostCount - posts.length,
    duplicateIds: [...new Set(duplicateIds)],
    missingIds,
    invalidDates,
    emptyContent,
    markdownRows,
    excelExists,
    excelRowCount: excelVerification?.rowCount ?? null,
    excelVerified,
    ok: Boolean(
      state.fullSyncCompleted &&
      latestRunComplete &&
      duplicateIds.length === 0 &&
      missingIds.length === 0 &&
      invalidDates.length === 0 &&
      emptyContent.length === 0 &&
      markdownRows === posts.length &&
      excelVerified
    ),
    verifiedAt: nowIso(),
  };
  await writeAtomic(files.verification, `${JSON.stringify(verification, null, 2)}\n`);
  return verification;
}
