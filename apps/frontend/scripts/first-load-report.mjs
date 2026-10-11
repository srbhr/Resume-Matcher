/** Prints first-load JS per route (gzip, level 9) from the last `next build`. */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const statsFile = path.join(root, '.next/diagnostics/route-bundle-stats.json');
if (!fs.existsSync(statsFile)) {
  console.error(
    'Run `npm run build` first — .next/diagnostics/route-bundle-stats.json is missing.'
  );
  process.exit(1);
}
const kb = (n) => (n / 1024).toFixed(1);
const rows = JSON.parse(fs.readFileSync(statsFile, 'utf8'))
  .map(({ route, firstLoadChunkPaths }) => {
    let raw = 0;
    let gz = 0;
    for (const chunk of firstLoadChunkPaths) {
      const buf = fs.readFileSync(path.join(root, chunk));
      raw += buf.length;
      gz += zlib.gzipSync(buf, { level: 9 }).length;
    }
    return { route, raw, gz };
  })
  .sort((a, b) => b.gz - a.gz);
console.log('| Route | First-load JS (gzip KB) | Raw KB |\n|---|---|---|');
for (const { route, raw, gz } of rows) console.log(`| \`${route}\` | ${kb(gz)} | ${kb(raw)} |`);
