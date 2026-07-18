import path from 'node:path';
import { createVault, loadVault, verifyVault, vaultPaths } from './vault.mjs';
import { importWechatArchive, importWeiboArchive } from './importers.mjs';

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}`);
    options[key] = value;
    index += 1;
  }
  return options;
}

function required(options, key) {
  if (!options[key]) throw new Error(`--${key} is required`);
  return path.resolve(options[key]);
}

function usage() {
  return `PersonaVault\n\n` +
    `Commands:\n` +
    `  personavault init --name <person> --output <vault> [--id <stable-id>]\n` +
    `  personavault import weibo --vault <vault> --archive <weibo-archive>\n` +
    `  personavault import wechat --vault <vault> --archive <mpvault-export>\n` +
    `  personavault verify --vault <vault>\n` +
    `  personavault status --vault <vault>\n`;
}

export async function runCli(args) {
  const [command, subject, ...rest] = args;
  if (!command || ['help', '--help', '-h'].includes(command)) {
    console.log(usage());
    return;
  }

  if (command === 'init') {
    const options = parseOptions([subject, ...rest].filter(Boolean));
    const outputDir = required(options, 'output');
    const vault = await createVault({ outputDir, name: options.name, personId: options.id });
    console.log(JSON.stringify({ ok: true, vault: vaultPaths(outputDir).vault, person: vault.person }, null, 2));
    return;
  }

  if (command === 'import') {
    if (!['weibo', 'wechat'].includes(subject)) throw new Error('Import source must be weibo or wechat');
    const options = parseOptions(rest);
    const vaultDir = required(options, 'vault');
    const archiveDir = required(options, 'archive');
    const result = subject === 'weibo'
      ? await importWeiboArchive({ vaultDir, archiveDir })
      : await importWechatArchive({ vaultDir, archiveDir });
    const verification = await verifyVault(vaultDir);
    console.log(JSON.stringify({ ok: verification.ok, import: result, verification }, null, 2));
    if (!verification.ok) process.exitCode = 1;
    return;
  }

  if (command === 'verify') {
    const options = parseOptions([subject, ...rest].filter(Boolean));
    const report = await verifyVault(required(options, 'vault'));
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
    return;
  }

  if (command === 'status') {
    const options = parseOptions([subject, ...rest].filter(Boolean));
    const vault = await loadVault(required(options, 'vault'));
    console.log(JSON.stringify({
      person: vault.person,
      sources: vault.sources,
      itemCount: Object.keys(vault.items).length,
      lastRun: vault.runs.at(-1) || null,
    }, null, 2));
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}
