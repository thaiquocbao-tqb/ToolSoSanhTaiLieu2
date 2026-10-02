import { copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const publicRoot = path.join(projectRoot, 'public');
const tesseractRoot = path.join(publicRoot, 'tesseract');
const tesseractCoreRoot = path.join(projectRoot, 'node_modules', 'tesseract.js-core');
const tessdataRoot = path.join(publicRoot, 'tessdata');

await mkdir(path.join(tesseractRoot, 'core'), { recursive: true });
await mkdir(tessdataRoot, { recursive: true });

async function downloadIfMissing(url, destination) {
  try {
    if ((await stat(destination)).size > 0) return;
  } catch {
    // Download missing assets below.
  }

  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Could not download ${url}: HTTP ${response.status}`);
  }

  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));
  console.log(`Downloaded ${path.basename(destination)}`);
}

await copyFile(
  path.join(projectRoot, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js'),
  path.join(tesseractRoot, 'worker.min.js')
);

const coreFiles = (await readdir(tesseractCoreRoot)).filter((filename) =>
  filename.startsWith('tesseract-core-')
  && (filename.endsWith('.js') || filename.endsWith('.wasm'))
);
if (coreFiles.length === 0) throw new Error(`No Tesseract WASM files found in ${tesseractCoreRoot}`);

for (const filename of coreFiles) {
  const source = path.join(tesseractCoreRoot, filename);
  const destination = path.join(tesseractRoot, 'core', filename);
  await copyFile(source, destination);
}

await downloadIfMissing(
  'https://tessdata.projectnaptha.com/4.0.0/vie.traineddata.gz',
  path.join(tessdataRoot, 'vie.traineddata.gz')
);

console.log(`Prepared Tesseract.js worker, ${coreFiles.length} WASM assets, and Vietnamese traineddata.`);