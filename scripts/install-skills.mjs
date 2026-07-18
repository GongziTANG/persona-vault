#!/usr/bin/env node

import { cp, lstat, mkdir, readlink, rename, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const availableSkills = ['build-persona-vault', 'mpvault-archive', 'archive-weibo-user'];
const targetRoots = {
  codex: path.join(os.homedir(), '.codex', 'skills'),
  claude: path.join(os.homedir(), '.claude', 'skills'),
  workbuddy: path.join(os.homedir(), '.workbuddy', 'skills'),
};

function commaList(value, allowed, label) {
  const values = value.split(',').map(item => item.trim()).filter(Boolean);
  const unknown = values.filter(item => !allowed.includes(item));
  if (unknown.length) throw new Error(`Unknown ${label}: ${unknown.join(', ')}`);
  return values;
}

function parseArgs(args) {
  const options = { targets: Object.keys(targetRoots), skills: availableSkills, mode: 'link', force: false };
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--force') {
      options.force = true;
      continue;
    }
    if (token === '--copy') {
      options.mode = 'copy';
      continue;
    }
    if (token === '--targets' || token === '--skills') {
      const value = args[index + 1];
      if (!value) throw new Error(`${token} requires a comma-separated value`);
      options[token.slice(2)] = commaList(
        value,
        token === '--targets' ? Object.keys(targetRoots) : availableSkills,
        token.slice(2)
      );
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${token}`);
  }
  return options;
}

async function existingTarget(destination, source) {
  try {
    const info = await lstat(destination);
    if (!info.isSymbolicLink()) return { exists: true, current: false };
    const linked = path.resolve(path.dirname(destination), await readlink(destination));
    return { exists: true, current: linked === source };
  } catch (error) {
    if (error.code === 'ENOENT') return { exists: false, current: false };
    throw error;
  }
}

async function installOne({ target, skill, mode, force }) {
  const source = path.join(repoRoot, 'skills', skill);
  const destinationRoot = targetRoots[target];
  const destination = path.join(destinationRoot, skill);
  await mkdir(destinationRoot, { recursive: true });
  const existing = await existingTarget(destination, source);
  if (existing.current && mode === 'link') return { target, skill, status: 'current', destination };
  if (existing.exists) {
    if (!force) throw new Error(`${destination} already exists; rerun with --force to move it to a timestamped backup`);
    const backup = `${destination}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    await rename(destination, backup);
  }
  if (mode === 'link') await symlink(source, destination, 'dir');
  else await cp(source, destination, { recursive: true, errorOnExist: true });
  return { target, skill, status: mode === 'link' ? 'linked' : 'copied', destination };
}

const options = parseArgs(process.argv.slice(2));
const results = [];
for (const target of options.targets) {
  for (const skill of options.skills) results.push(await installOne({ target, skill, ...options }));
}
console.log(JSON.stringify({ ok: true, repoRoot, results }, null, 2));
