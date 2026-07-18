#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const excludedDirectories = new Set(['.git', 'node_modules']);
const textExtensions = new Set(['', '.md', '.mjs', '.js', '.json', '.yaml', '.yml', '.txt']);
const checks = [
  { name: 'macOS home path', pattern: /\/Users\/[A-Za-z0-9._-]+/g },
  { name: 'Linux home path', pattern: /\/home\/[A-Za-z0-9._-]+/g },
  { name: 'Windows home path', pattern: /[A-Za-z]:\\Users\\[^\\\s]+/g },
  { name: 'GitHub token', pattern: /(?:gho|ghp|github_pat)_[A-Za-z0-9_]{12,}/g },
  { name: 'OpenAI-style secret', pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/g },
  { name: 'private key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { name: 'email address', pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
];

const privateMarkers = String(process.env.PERSONAVAULT_PRIVATE_MARKERS || '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else if (entry.isFile() && textExtensions.has(path.extname(entry.name))) files.push(absolute);
  }
  return files;
}

const files = await walk(root);
const findings = [];
for (const file of files) {
  const relative = path.relative(root, file);
  const text = await readFile(file, 'utf8');
  for (const check of checks) {
    for (const match of text.matchAll(check.pattern)) findings.push({ file: relative, type: check.name, match: match[0] });
  }
  for (const marker of privateMarkers) {
    if (text.includes(marker)) findings.push({ file: relative, type: 'private marker', match: marker });
  }
}

if (findings.length) {
  console.error(JSON.stringify({ ok: false, findings }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ ok: true, scannedRoot: '.', filesScanned: files.length }, null, 2));
}
