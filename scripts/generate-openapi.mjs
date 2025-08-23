#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(root, '..', 'apps', 'frontend', 'lib', 'api');
mkdirSync(outDir, { recursive: true });

const OPENAPI_URL = process.env.OPENAPI_URL || 'http://localhost:8000/api/openapi.json';

console.log('[generate-openapi] Fetching schema from', OPENAPI_URL);
try {
  execSync(`npx openapi-typescript ${OPENAPI_URL} -o ${path.join(outDir, 'types.ts')}` , { stdio: 'inherit' });
  // Create lightweight fetch wrapper if not exists
  const clientFile = path.join(outDir, 'client.ts');
  try { require('node:fs').accessSync(clientFile); } catch {
    writeFileSync(clientFile, `import type { paths } from './types';\n\n// Basic typed fetch helper\nexport async function apiFetch<P extends keyof paths, M extends keyof paths[P] & string>(\n  path: P, method: M, params: RequestInit & { query?: Record<string,string|number|boolean|undefined> } = {}\n): Promise<any> {\n  const base = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';\n  let url = base + path;\n  if (params.query) {\n    const qs = Object.entries(params.query)\n      .filter(([,v]) => v !== undefined)\n      .map(([k,v]) => k + '=' + encodeURIComponent(String(v)))\n      .join('&');\n    if (qs) url += (url.includes('?') ? '&' : '?') + qs;\n  }\n  const res = await fetch(url, { method: method.toUpperCase(), ...params });\n  if (!res.ok) throw new Error('API ' + method + ' ' + path + ' failed: ' + res.status);\n  const ct = res.headers.get('content-type') || '';\n  return ct.includes('application/json') ? res.json() : res.text();\n}\n`);
  }
  console.log('[generate-openapi] Done.');
} catch (e) {
  console.error('[generate-openapi] Failed', e?.message);
  process.exit(1);
}
