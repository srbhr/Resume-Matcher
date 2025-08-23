import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

// Attempt to load prettier plugin; if unavailable (e.g. prod install sans devDeps) skip gracefully.
let prettierPlugin;
try {
  const mod = await import('eslint-plugin-prettier');
  prettierPlugin = mod.default || mod;
} catch {
  // plugin not available; will skip adding its rule to avoid warning
}

const base = [...compat.extends('next/core-web-vitals', 'next/typescript')];

if (prettierPlugin && prettierPlugin.rules && prettierPlugin.rules.prettier) {
  // Disable the rule during build to avoid failing on style-only issues; rely on separate prettier:fix script.
  // Set ENFORCE_PRETTIER=1 to turn warnings back on locally when desired.
  const severity = process.env.ENFORCE_PRETTIER ? 'warn' : 'off';
  base.push({
    plugins: { prettier: prettierPlugin },
    rules: { 'prettier/prettier': severity },
  });
}

// Common TS rules relaxed in CI unless ENFORCE_STRICT=1 is set
base.push({
  rules: {
    '@typescript-eslint/no-explicit-any': process.env.ENFORCE_STRICT ? 'error' : 'warn',
    '@typescript-eslint/no-unused-vars': [process.env.ENFORCE_STRICT ? 'error' : 'warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'prefer-const': process.env.ENFORCE_STRICT ? 'error' : 'warn',
  }
});

// Ignore generated/build artifacts to cut noise & speed lint.
base.push({
  ignores: [
    '.next/**',
    'node_modules/**',
    'public/**/*.map'
  ]
});

export default base;
