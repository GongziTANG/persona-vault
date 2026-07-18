import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const VAULT_VERSION = 1;
export const ITEM_STATUSES = new Set(['captured', 'deleted', 'unavailable', 'failed', 'pending']);

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

function slugify(value) {
  return cleanText(value)
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'person';
}

function canonicalDate(value, field, { optional = false } = {}) {
  const raw = cleanText(value);
  if (!raw && optional) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new Error(`${field} is not a valid date: ${raw || '(empty)'}`);
  return date.toISOString();
}

function stableChecksum(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function writeAtomic(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${randomUUID()}`;
  await writeFile(temporary, value, 'utf8');
  await rename(temporary, file);
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

export function vaultPaths(outputDir) {
  return {
    vault: path.join(outputDir, 'vault.json'),
    manifest: path.join(outputDir, 'manifest.json'),
    verification: path.join(outputDir, 'verification.json'),
    markdown: path.join(outputDir, 'exports', 'timeline.md'),
    jsonl: path.join(outputDir, 'exports', 'content.jsonl'),
  };
}

export async function createVault({ outputDir, name, personId }) {
  const displayName = cleanText(name);
  if (!displayName) throw new Error('Person name is required');
  const files = vaultPaths(outputDir);
  try {
    const existing = await readJson(files.vault);
    if (personId && existing.person.id !== personId) {
      throw new Error(`Vault person ID mismatch: ${existing.person.id} != ${personId}`);
    }
    return existing;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const createdAt = nowIso();
  const vault = {
    version: VAULT_VERSION,
    person: {
      id: cleanText(personId) || slugify(displayName),
      displayName,
      aliases: [],
    },
    sources: {},
    items: {},
    runs: [],
    createdAt,
    updatedAt: createdAt,
  };
  await persistVault(outputDir, vault);
  return vault;
}

export async function loadVault(outputDir) {
  return readJson(vaultPaths(outputDir).vault);
}

export function normalizeItem(raw) {
  const platform = cleanText(raw.platform).toLowerCase();
  const sourceAccountId = cleanText(raw.sourceAccountId);
  const sourceItemId = cleanText(raw.sourceItemId);
  const status = cleanText(raw.status || 'captured').toLowerCase();
  if (!platform || !sourceAccountId || !sourceItemId) throw new Error('Item requires platform, sourceAccountId, and sourceItemId');
  if (!ITEM_STATUSES.has(status)) throw new Error(`Unsupported item status: ${status}`);
  const content = cleanText(raw.content);
  if (status === 'captured' && !content) throw new Error(`Captured item ${sourceItemId} has no content`);

  const id = `${platform}:${sourceAccountId}:${sourceItemId}`;
  const normalized = {
    id,
    platform,
    sourceAccountId,
    sourceItemId,
    type: cleanText(raw.type || 'post'),
    title: cleanText(raw.title),
    content,
    author: cleanText(raw.author),
    publishedAt: canonicalDate(raw.publishedAt, 'publishedAt', { optional: status !== 'captured' }),
    sourceUrl: cleanText(raw.sourceUrl),
    status,
    media: Array.isArray(raw.media) ? raw.media : [],
    relations: Array.isArray(raw.relations) ? raw.relations : [],
    metadata: raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : {},
    provenance: {
      capturedAt: canonicalDate(raw.provenance?.capturedAt || nowIso(), 'provenance.capturedAt'),
      sourceArchive: cleanText(raw.provenance?.sourceArchive),
    },
  };
  normalized.checksum = stableChecksum({
    platform: normalized.platform,
    sourceAccountId: normalized.sourceAccountId,
    sourceItemId: normalized.sourceItemId,
    type: normalized.type,
    title: normalized.title,
    content: normalized.content,
    author: normalized.author,
    publishedAt: normalized.publishedAt,
    sourceUrl: normalized.sourceUrl,
    status: normalized.status,
    media: normalized.media,
    relations: normalized.relations,
    metadata: normalized.metadata,
  });
  return normalized;
}

export async function mergeSource({ outputDir, source, items, run }) {
  const vault = await loadVault(outputDir);
  const platform = cleanText(source.platform).toLowerCase();
  const accountId = cleanText(source.accountId);
  if (!platform || !accountId) throw new Error('Source requires platform and accountId');
  const sourceKey = `${platform}:${accountId}`;
  const priorSource = vault.sources[sourceKey];
  if (priorSource && priorSource.platform !== platform) throw new Error(`Source identity mismatch for ${sourceKey}`);

  let added = 0;
  let updated = 0;
  let unchanged = 0;
  for (const item of items.map(normalizeItem)) {
    const existing = vault.items[item.id];
    if (!existing) {
      vault.items[item.id] = item;
      added += 1;
    } else if (existing.checksum !== item.checksum) {
      vault.items[item.id] = {
        ...item,
        provenance: {
          ...item.provenance,
          firstCapturedAt: existing.provenance?.firstCapturedAt || existing.provenance?.capturedAt,
        },
      };
      updated += 1;
    } else {
      unchanged += 1;
    }
  }

  const syncedAt = nowIso();
  vault.sources[sourceKey] = {
    platform,
    accountId,
    displayName: cleanText(source.displayName),
    canonicalUrl: cleanText(source.canonicalUrl),
    fullSyncCompleted: Boolean(source.fullSyncCompleted),
    reportedCount: Number.isFinite(Number(source.reportedCount)) ? Number(source.reportedCount) : null,
    accessibleCount: Number.isFinite(Number(source.accessibleCount)) ? Number(source.accessibleCount) : items.length,
    statusCounts: source.statusCounts || { captured: items.filter(item => (item.status || 'captured') === 'captured').length },
    lastSyncedAt: syncedAt,
  };
  const runMode = cleanText(run?.mode || (priorSource ? 'incremental' : 'full'));
  if (!['full', 'incremental'].includes(runMode)) throw new Error(`Unsupported run mode: ${runMode}`);
  vault.runs.push({
    id: randomUUID(),
    sourceKey,
    mode: runMode,
    added,
    updated,
    unchanged,
    scanned: Number(run?.scanned ?? items.length),
    completed: run?.completed !== false,
    evidence: run?.evidence || {},
    finishedAt: canonicalDate(run?.finishedAt || syncedAt, 'run.finishedAt'),
  });
  vault.updatedAt = syncedAt;
  await persistVault(outputDir, vault);
  return { sourceKey, added, updated, unchanged, total: Object.keys(vault.items).length };
}

function sortedItems(vault) {
  return Object.values(vault.items).sort((left, right) => {
    const leftDate = left.publishedAt || '9999';
    const rightDate = right.publishedAt || '9999';
    return leftDate.localeCompare(rightDate) || left.id.localeCompare(right.id);
  });
}

function markdownCell(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

async function persistVault(outputDir, vault) {
  const files = vaultPaths(outputDir);
  const items = sortedItems(vault);
  const markdown = [
    `# ${vault.person.displayName} — PersonaVault`,
    '',
    `- Sources: ${Object.keys(vault.sources).length}`,
    `- Items: ${items.length}`,
    `- Updated: ${vault.updatedAt}`,
    '',
    '| # | Published | Source | Type | Title | Content | Status |',
    '|---:|---|---|---|---|---|---|',
    ...items.map((item, index) => [
      `| ${index + 1}`,
      item.publishedAt || '',
      item.platform,
      item.type,
      markdownCell(item.title),
      markdownCell(item.content),
      `${item.status} |`,
    ].join(' | ')),
    '',
  ].join('\n');
  const jsonl = items.map(item => JSON.stringify(item)).join('\n') + (items.length ? '\n' : '');
  const manifest = {
    version: vault.version,
    person: vault.person,
    sourceCount: Object.keys(vault.sources).length,
    itemCount: items.length,
    statusCounts: Object.fromEntries([...ITEM_STATUSES].map(status => [status, items.filter(item => item.status === status).length])),
    oldestPublishedAt: items.find(item => item.publishedAt)?.publishedAt || null,
    newestPublishedAt: [...items].reverse().find(item => item.publishedAt)?.publishedAt || null,
    sources: vault.sources,
    lastRun: vault.runs.at(-1) || null,
    generatedAt: nowIso(),
  };
  await writeAtomic(files.vault, `${JSON.stringify(vault, null, 2)}\n`);
  await writeAtomic(files.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeAtomic(files.markdown, markdown);
  await writeAtomic(files.jsonl, jsonl);
}

export async function verifyVault(outputDir) {
  const files = vaultPaths(outputDir);
  const vault = await loadVault(outputDir);
  const items = Object.values(vault.items);
  const ids = items.map(item => item.id);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  const invalidStatuses = items.filter(item => !ITEM_STATUSES.has(item.status)).map(item => item.id);
  const invalidDates = items.filter(item => item.publishedAt && Number.isNaN(new Date(item.publishedAt).getTime())).map(item => item.id);
  const emptyCapturedContent = items.filter(item => item.status === 'captured' && !cleanText(item.content)).map(item => item.id);
  const malformedIds = items.filter(item => item.id !== `${item.platform}:${item.sourceAccountId}:${item.sourceItemId}`).map(item => item.id);
  const checksumMismatches = items.filter(item => normalizeItem(item).checksum !== item.checksum).map(item => item.id);
  const markdown = await readFile(files.markdown, 'utf8');
  const jsonl = await readFile(files.jsonl, 'utf8');
  const markdownRows = markdown.split('\n').filter(line => /^\| \d+ \|/.test(line)).length;
  const jsonlRows = jsonl.trim() ? jsonl.trim().split('\n').length : 0;
  const sourceIssues = Object.entries(vault.sources).flatMap(([key, source]) => {
    const issues = [];
    if (key !== `${source.platform}:${source.accountId}`) issues.push(`${key}: identity mismatch`);
    if (!source.lastSyncedAt || Number.isNaN(new Date(source.lastSyncedAt).getTime())) issues.push(`${key}: invalid lastSyncedAt`);
    return issues;
  });
  const incompleteSources = Object.entries(vault.sources).filter(([, source]) => !source.fullSyncCompleted).map(([key]) => key);
  const sourceCountMismatches = Object.entries(vault.sources).flatMap(([key, source]) => {
    const captured = items.filter(item => `${item.platform}:${item.sourceAccountId}` === key && item.status === 'captured').length;
    return captured === source.accessibleCount ? [] : [`${key}: accessibleCount=${source.accessibleCount}, captured=${captured}`];
  });
  const sourceRunIssues = Object.keys(vault.sources).flatMap(key => {
    const runs = vault.runs.filter(run => run.sourceKey === key);
    if (!runs.length) return [`${key}: no import run`];
    return runs.at(-1).completed ? [] : [`${key}: latest import incomplete`];
  });
  const ok = Boolean(
    vault.version === VAULT_VERSION &&
    vault.person?.id &&
    vault.person?.displayName &&
    duplicateIds.length === 0 &&
    invalidStatuses.length === 0 &&
    invalidDates.length === 0 &&
    emptyCapturedContent.length === 0 &&
    malformedIds.length === 0 &&
    checksumMismatches.length === 0 &&
    sourceIssues.length === 0 &&
    incompleteSources.length === 0 &&
    sourceCountMismatches.length === 0 &&
    sourceRunIssues.length === 0 &&
    markdownRows === items.length &&
    jsonlRows === items.length
  );
  const report = {
    ok,
    version: vault.version,
    person: vault.person,
    sourceCount: Object.keys(vault.sources).length,
    itemCount: items.length,
    duplicateIds: [...new Set(duplicateIds)],
    invalidStatuses,
    invalidDates,
    emptyCapturedContent,
    malformedIds,
    checksumMismatches,
    sourceIssues,
    incompleteSources,
    sourceCountMismatches,
    sourceRunIssues,
    markdownRows,
    jsonlRows,
    verifiedAt: nowIso(),
  };
  await writeAtomic(files.verification, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

export async function fileExists(file) {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}
