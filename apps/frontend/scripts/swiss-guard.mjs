/**
 * Swiss guard — flags patterns the Swiss design system bans
 * (docs/portable/swiss-design-system/anti-patterns.md, spec §9.1) in app/
 * and components/, and ratchets the counts against
 * tests/swiss-guard.allowlist.json. The allowlist may only shrink.
 *
 *   node scripts/swiss-guard.mjs [path-prefix…]        report violations
 *   node scripts/swiss-guard.mjs --update              lower the allowlist to today's counts
 *   node scripts/swiss-guard.mjs --update --allow-increase   (phase 0 only) write any counts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SCAN_DIRS = ['app', 'components'];
export const EXCLUDED_PREFIXES = ['components/resume/', 'app/print/'];
export const ALLOWLIST_PATH = 'tests/swiss-guard.allowlist.json';

const PALETTE =
  '(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)';
const COLOR_PREFIX =
  '(?:bg|text|border(?:-[trblxyse])?|ring(?:-offset)?|fill|stroke|outline|divide|placeholder|from|to|via|accent|caret|decoration|shadow)';
const DECORATIVE_ICONS =
  /\b(?:Sparkles?|WandSparkles|Wand2?|Stars?|Heart|Zap|Rocket|PartyPopper)\b/g;

export const LINE_RULES = [
  {
    id: 'radius',
    re: /(?<![\w-])rounded(?:-(?!none\b)[\w[\]./-]+)?(?![\w-])/g,
    hint: 'Use rounded-none — Swiss corners are square.',
  },
  {
    id: 'soft-shadow',
    re: /(?<![\w-])shadow(?:-(?:sm|md|lg|xl|2xl|inner))?(?![\w-])|(?<![\w-])shadow-\[/g,
    hint: 'Use a hard shadow token: shadow-sw-sm (controls), shadow-sw-default (cards), shadow-sw-lg (dialogs).',
  },
  {
    id: 'gradient',
    re: /\bbg-(?:gradient|linear|radial|conic)-|(?:linear|radial|conic)-gradient\(/g,
    hint: 'No gradients. The blueprint grid is the bg-blueprint utility.',
  },
  {
    id: 'palette',
    re: new RegExp(`(?<![\\w-])${COLOR_PREFIX}-${PALETTE}-\\d{2,3}\\b`, 'g'),
    hint: 'Use a semantic token: primary, success, destructive, warning, warning-text, *-tint, steel, ink-soft, panel, paper, highlight.',
  },
  {
    id: 'raw-colour',
    re: /\[#[0-9a-fA-F]{3,8}\]|(['"`])#[0-9a-fA-F]{3,4}\1|#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\b|rgba?\(/g,
    hint: 'No raw colours in TSX — use a token class, or var(--sw-*) inside a style object.',
  },
  {
    id: 'ink-tint',
    re: /(?<![\w-])(?:text|border|bg)-black\/\d+/g,
    hint: 'text-black/NN → text-steel; border-black/10 → border-panel-hover; bg-black/NN → bg-overlay.',
  },
  { id: 'dark', re: /(?<![\w-])dark:/g, hint: 'Light theme only — no dark: variants.' },
  {
    id: 'type-size',
    re: /(?<![\w-])text-\[\d+(?:\.\d+)?px\]/g,
    hint: 'Minimum text-xs; use the type scale.',
  },
  {
    id: 'spacing',
    re: /(?<![\w-])-?(?:p[trblxyse]?|m[trblxyse]?|gap(?:-[xy])?|space-[xy])-(?:5|7|9|10|11|14|\d\.5)(?![\w.])/g,
    skip: (file) => file.startsWith('components/ui/'),
    hint: 'Use the spacing scale: 1, 2, 3, 4, 6, 8, 12, 16.',
  },
  {
    id: 'transition',
    re: /(?<![\w-])transition-all(?![\w-])/g,
    hint: 'Name the properties: transition-[transform,box-shadow,background-color] or transition-colors.',
  },
  {
    id: 'keyframes',
    re: /(?<![\w-])animate-(?:bounce|pulse|ping)(?![\w-])/g,
    hint: 'No decorative loops — use StatusIndicator, or Loader2 for in-flight work.',
  },
  {
    id: 'legacy-token',
    re: /(?<![\w-])(?:[a-z]+:)*(?:[a-z]+-)?(?:steel-grey|paper-tint|muted-foreground)(?![\w-])|(?<![\w-])(?:bg|text|border)-(?:secondary|background|foreground|muted)(?![\w-])/g,
    hint: 'steel-grey→steel, paper-tint→paper, muted-foreground→steel, secondary→panel, background→canvas, foreground→ink.',
  },
  {
    id: 'glyph',
    re: /[✨✓✔⭐🚀]|>[^<{}\n]*•[^<{}\n]*</g,
    hint: 'No text glyphs as icons — use a lucide icon with aria-hidden, or nothing.',
  },
];

export const FILE_RULES = [
  {
    id: 'decorative-icon',
    hint: 'Functional icons only — drop Sparkles/Wand/Star/Heart/Zap/Rocket.',
    find(text) {
      const found = [];
      for (const imp of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]lucide-react['"]/g)) {
        const start = imp.index + imp[0].indexOf(imp[1]);
        for (const name of imp[1].matchAll(DECORATIVE_ICONS)) {
          found.push({ index: start + name.index, match: name[0] });
        }
      }
      for (const deep of text.matchAll(
        /from\s*['"]lucide-react\/dist\/esm\/icons\/(sparkles?|wand(?:-sparkles)?|stars?|heart|zap|rocket|party-popper)['"]/g
      )) {
        found.push({ index: deep.index, match: deep[1] });
      }
      return found;
    },
  },
  {
    id: 'motion-import',
    hint: "Import { m } from 'motion/react' — LazyMotion runs in strict mode.",
    find(text) {
      const found = [];
      for (const imp of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]motion\/react['"]/g)) {
        if (/\bmotion\b/.test(imp[1])) found.push({ index: imp.index, match: 'motion' });
      }
      for (const imp of text.matchAll(/from\s*['"]framer-motion['"]/g)) {
        found.push({ index: imp.index, match: 'framer-motion' });
      }
      return found;
    },
  },
];

/** Blank out comments (keeping newlines and lengths) so hex values in doc comments don't count. */
export function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:'"`\\])\/\/[^\n]*/gm,
      (whole, pre) => pre + ' '.repeat(whole.length - pre.length)
    );
}

export function scanSource(relPath, src) {
  const text = stripComments(src);
  const lines = text.split('\n');
  const raw = src.split('\n');
  const hits = [];
  for (const rule of LINE_RULES) {
    if (rule.skip?.(relPath)) continue;
    lines.forEach((line, i) => {
      for (const match of line.matchAll(rule.re)) {
        hits.push({ rule: rule.id, line: i + 1, match: match[0], text: raw[i].trim() });
      }
    });
  }
  for (const rule of FILE_RULES) {
    for (const { index, match } of rule.find(text)) {
      const line = text.slice(0, index).split('\n').length;
      hits.push({ rule: rule.id, line, match, text: raw[line - 1].trim() });
    }
  }
  return hits.sort((a, b) => a.line - b.line);
}

export function listFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const abs = path.join(dir, entry.name);
      const rel = path.relative(root, abs).split(path.sep).join('/');
      if (entry.isDirectory()) walk(abs);
      else if (rel.endsWith('.tsx') && !EXCLUDED_PREFIXES.some((p) => rel.startsWith(p)))
        out.push(rel);
    }
  };
  for (const dir of SCAN_DIRS) {
    const abs = path.join(root, dir);
    if (fs.existsSync(abs)) walk(abs);
  }
  return out.sort();
}

export function scanTree(root) {
  const byFile = {};
  for (const rel of listFiles(root)) {
    const hits = scanSource(rel, fs.readFileSync(path.join(root, rel), 'utf8'));
    if (hits.length) byFile[rel] = hits;
  }
  return byFile;
}

export function countHits(byFile) {
  const counts = {};
  for (const [file, hits] of Object.entries(byFile)) {
    counts[file] = {};
    for (const { rule } of hits) counts[file][rule] = (counts[file][rule] ?? 0) + 1;
  }
  return counts;
}

export function loadAllowlist(root) {
  const file = path.join(root, ALLOWLIST_PATH);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
}

export function writeAllowlist(root, counts) {
  const sorted = {};
  for (const file of Object.keys(counts).sort()) {
    sorted[file] = {};
    for (const rule of Object.keys(counts[file]).sort()) sorted[file][rule] = counts[file][rule];
  }
  fs.writeFileSync(path.join(root, ALLOWLIST_PATH), `${JSON.stringify(sorted, null, 2)}\n`);
}

export function compareCounts(counts, allow) {
  const increased = [];
  const decreased = [];
  const files = new Set([...Object.keys(counts), ...Object.keys(allow)]);
  for (const file of files) {
    const rules = new Set([...Object.keys(counts[file] ?? {}), ...Object.keys(allow[file] ?? {})]);
    for (const rule of rules) {
      const actual = counts[file]?.[rule] ?? 0;
      const allowed = allow[file]?.[rule] ?? 0;
      if (actual > allowed) increased.push({ file, rule, allowed, actual });
      if (actual < allowed) decreased.push({ file, rule, allowed, actual });
    }
  }
  return { increased, decreased };
}

const HINTS = Object.fromEntries([...LINE_RULES, ...FILE_RULES].map((r) => [r.id, r.hint]));

export function formatRatchetReport({ increased, decreased }, byFile) {
  const out = [];
  if (increased.length) {
    out.push('New Swiss-style drift (fix it — do not raise the allowlist):');
    for (const { file, rule, allowed, actual } of increased) {
      out.push(`  ${file} [${rule}] ${allowed} → ${actual}. ${HINTS[rule]}`);
      for (const hit of (byFile[file] ?? []).filter((h) => h.rule === rule)) {
        out.push(`    ${file}:${hit.line}  ${hit.text}`);
      }
    }
  }
  if (decreased.length) {
    out.push('Drift was fixed — lower the allowlist with `npm run guard:update`:');
    for (const { file, rule, allowed, actual } of decreased) {
      out.push(`  ${file} [${rule}] ${allowed} → ${actual}`);
    }
  }
  return out.join('\n');
}

function main(argv) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const byFile = scanTree(root);
  if (argv.includes('--update')) {
    const counts = countHits(byFile);
    const { increased } = compareCounts(counts, loadAllowlist(root));
    if (increased.length && !argv.includes('--allow-increase')) {
      console.error(formatRatchetReport({ increased, decreased: [] }, byFile));
      console.error('\nRefusing to raise the allowlist. Fix the drift instead.');
      return 1;
    }
    writeAllowlist(root, counts);
    console.log(`Allowlist written: ${Object.keys(counts).length} files.`);
    return 0;
  }
  const filters = argv.filter((a) => !a.startsWith('--'));
  let total = 0;
  for (const [file, hits] of Object.entries(byFile)) {
    if (filters.length && !filters.some((f) => file.startsWith(f))) continue;
    for (const hit of hits) {
      total += 1;
      console.log(`${file}:${hit.line} [${hit.rule}] ${hit.text}\n    → ${HINTS[hit.rule]}`);
    }
  }
  console.log(`\n${total} Swiss-guard hit(s).`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // exitCode, not exit(): on macOS stdout pipes are async and exit() drops queued output.
  process.exitCode = main(process.argv.slice(2));
}
