import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MAX_FILE_BYTES = 20_000_000;
export const DEFAULT_MAX_BYTES = MAX_FILE_BYTES;

function walk(root, relative = '') {
  return fs.readdirSync(path.join(root, relative), { withFileTypes: true }).flatMap((entry) => {
    const next = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Симлинки в dist не поддерживаются: ${next}`);
    return entry.isDirectory() ? walk(root, next) : [next];
  });
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}

function u16(value) { const buffer = Buffer.alloc(2); buffer.writeUInt16LE(value, 0); return buffer; }
function u32(value) { const buffer = Buffer.alloc(4); buffer.writeUInt32LE(value >>> 0, 0); return buffer; }

function makeZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  let rawBytes = 0;

  for (const file of files) {
    const name = file.relative.replaceAll(path.sep, '/');
    if (!name || name.startsWith('/') || name.split('/').includes('..') || name.includes('\\')) throw new Error(`Небезопасное имя в архиве: ${name}`);
    const nameBytes = Buffer.from(name, 'utf8');
    const data = fs.readFileSync(file.absolute);
    const compressed = zlib.deflateRawSync(data, { level: 9 });
    const method = compressed.length < data.length ? 8 : 0;
    const payload = method === 8 ? compressed : data;
    const { time, date } = dosDateTime(file.mtime);
    const crc = crc32(data);
    const local = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0x0800), u16(method), u16(time), u16(date),
      u32(crc), u32(payload.length), u32(data.length), u16(nameBytes.length), u16(0), nameBytes, payload
    ]);
    localParts.push(local);
    centralParts.push(Buffer.concat([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(method), u16(time), u16(date),
      u32(crc), u32(payload.length), u32(data.length), u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(offset), nameBytes
    ]));
    offset += local.length;
    rawBytes += data.length;
  }

  const central = Buffer.concat(centralParts);
  const locals = Buffer.concat(localParts);
  const end = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(central.length), u32(locals.length), u16(0)
  ]);
  return { buffer: Buffer.concat([locals, central, end]), rawBytes };
}

export function packSite({ distRoot = path.join(projectRoot, 'dist'), output = path.join(projectRoot, 'dist.zip'), maxBytes = DEFAULT_MAX_BYTES } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error(`Лимит архива должен быть положительным целым числом: ${maxBytes}`);
  if (!fs.existsSync(distRoot) || !fs.statSync(distRoot).isDirectory()) throw new Error(`dist не найден: ${distRoot}. Сначала выполните npm run build:demo.`);
  const files = walk(distRoot).sort().map((relative) => {
    const absolute = path.join(distRoot, relative);
    const stat = fs.statSync(absolute);
    if (stat.size > MAX_FILE_BYTES) throw new Error(`Файл ${relative} превышает лимит ${MAX_FILE_BYTES.toLocaleString('ru-RU').replaceAll('\u00a0', ' ')} B.`);
    return { relative, absolute, mtime: stat.mtime };
  });
  if (!files.length) throw new Error('dist пуст: архивировать нечего.');
  const zip = makeZip(files);
  if (zip.buffer.length > maxBytes) throw new Error(`Архив слишком большой: ${zip.buffer.length} B > ${maxBytes} B.`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, zip.buffer);
  return { output, files: files.length, rawBytes: zip.rawBytes, zipBytes: zip.buffer.length };
}

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    const build = spawnSync(process.execPath, [path.join(projectRoot, 'scripts', 'build-static.mjs'), '--include-draft'], { cwd: projectRoot, stdio: 'inherit' });
    if (build.status !== 0) throw new Error(`build:demo завершился с exit code ${build.status ?? 1}`);
    const result = packSite({
      distRoot: path.resolve(option('--dist', path.join(projectRoot, 'dist'))),
      output: path.resolve(option('--output', path.join(projectRoot, 'dist.zip'))),
      maxBytes: Number(option('--max-bytes', DEFAULT_MAX_BYTES))
    });
    console.log(`Site package created: ${path.relative(projectRoot, result.output)} (${result.files} files, ${result.zipBytes} B zip, ${result.rawBytes} B raw).`);
  } catch (error) {
    console.error(`Site package failed: ${error.message}`);
    process.exitCode = 1;
  }
}
