import fs from 'node:fs/promises';
import path from 'node:path';
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool';

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`缺少 --${name}`);
  return process.argv[index + 1];
}

function sanitizeName(value) {
  return String(value).replace(/[\\/:*?"<>|]/g, '_') || '微博用户';
}

function excelDate(iso) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return new Date(Date.UTC(+value.year, +value.month - 1, +value.day, +value.hour, +value.minute, +value.second));
}

const outputDir = path.resolve(arg('output'));
const state = JSON.parse(await fs.readFile(path.join(outputDir, '.state', 'archive.json'), 'utf8'));
const posts = Object.values(state.posts).sort((left, right) => left.publishedAt.localeCompare(right.publishedAt) || left.id.localeCompare(right.id));
const stem = `${sanitizeName(state.account.name)}_微博归档`;
const outputFile = path.join(outputDir, `${stem}.xlsx`);
const qaDir = path.join(outputDir, '.state', 'qa');

const workbook = Workbook.create();
const sheet = workbook.worksheets.add('微博归档');
sheet.showGridLines = false;
sheet.freezePanes.freezeRows(1);
sheet.getRange('A1:C1').values = [['序号', '发表日期', '内容']];
if (posts.length) {
  sheet.getRangeByIndexes(1, 0, posts.length, 3).values = posts.map((post, index) => [
    index + 1,
    excelDate(post.publishedAt),
    post.content,
  ]);
}

const usedRows = Math.max(1, posts.length + 1);
sheet.getRange(`A1:C${usedRows}`).format = {
  font: { name: 'Arial', size: 10, color: '#1F2937' },
  verticalAlignment: 'top',
};
sheet.getRange('A1:C1').format = {
  fill: '#6B4F3A',
  font: { name: 'Arial', size: 11, bold: true, color: '#FFFFFF' },
  horizontalAlignment: 'center',
  verticalAlignment: 'center',
  rowHeight: 26,
  borders: { preset: 'outside', style: 'thin', color: '#5A4030' },
};
sheet.getRange(`A2:A${usedRows}`).format = { horizontalAlignment: 'right', verticalAlignment: 'top' };
sheet.getRange(`B2:B${usedRows}`).format = { horizontalAlignment: 'left', verticalAlignment: 'top', numberFormat: 'yyyy-mm-dd hh:mm:ss' };
sheet.getRange(`C2:C${usedRows}`).format = { horizontalAlignment: 'left', verticalAlignment: 'top', wrapText: true };
sheet.getRange(`A2:C${usedRows}`).format.borders = {
  insideHorizontal: { style: 'thin', color: '#E5E7EB' },
  insideVertical: { style: 'thin', color: '#E5E7EB' },
  bottom: { style: 'thin', color: '#D1D5DB' },
};
sheet.getRange(`A1:A${usedRows}`).format.columnWidth = 9;
sheet.getRange(`B1:B${usedRows}`).format.columnWidth = 22;
sheet.getRange(`C1:C${usedRows}`).format.columnWidth = 92;
if (posts.length) sheet.getRange(`A2:C${usedRows}`).format.autofitRows();
if (posts.length) sheet.tables.add(`A1:C${usedRows}`, true, 'WeiboArchiveTable');

const inspectTop = await workbook.inspect({
  kind: 'table',
  range: `微博归档!A1:C${Math.min(8, usedRows)}`,
  include: 'values,formulas',
  tableMaxRows: 8,
  tableMaxCols: 3,
});
const errors = await workbook.inspect({
  kind: 'match',
  searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A',
  options: { useRegex: true, maxResults: 50 },
  summary: 'final formula error scan',
});

await fs.mkdir(qaDir, { recursive: true });
const topPreview = await workbook.render({ sheetName: '微博归档', range: `A1:C${Math.min(8, usedRows)}`, scale: 1, format: 'png' });
await fs.writeFile(path.join(qaDir, 'top.png'), new Uint8Array(await topPreview.arrayBuffer()));
if (usedRows > 8) {
  const bottomStart = Math.max(2, usedRows - 6);
  const bottomPreview = await workbook.render({ sheetName: '微博归档', range: `A${bottomStart}:C${usedRows}`, scale: 1, format: 'png' });
  await fs.writeFile(path.join(qaDir, 'bottom.png'), new Uint8Array(await bottomPreview.arrayBuffer()));
}

await fs.mkdir(outputDir, { recursive: true });
const blob = await SpreadsheetFile.exportXlsx(workbook);
await blob.save(outputFile);
const errorRecords = errors.ndjson.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
const excelVerification = {
  sheetName: '微博归档',
  rowCount: posts.length,
  formulaErrorsFound: errorRecords.some(record => record.kind !== 'notice'),
  inspectedRange: `A1:C${Math.min(8, usedRows)}`,
  renderedRanges: usedRows > 8
    ? [`A1:C${Math.min(8, usedRows)}`, `A${Math.max(2, usedRows - 6)}:C${usedRows}`]
    : [`A1:C${Math.min(8, usedRows)}`],
  verifiedAt: new Date().toISOString(),
};
await fs.writeFile(path.join(outputDir, '.state', 'excel-verification.json'), `${JSON.stringify(excelVerification, null, 2)}\n`, 'utf8');
await fs.rm(`${outputFile}.inspect.ndjson`, { force: true });
console.log(JSON.stringify({
  outputFile,
  rowCount: posts.length,
  inspect: inspectTop.ndjson,
  formulaErrors: errors.ndjson,
  previews: usedRows > 8 ? ['top.png', 'bottom.png'] : ['top.png'],
}));
