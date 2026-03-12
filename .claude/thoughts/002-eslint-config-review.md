# Code Review: ESLint Configuration

**Reviewed:** 2026-03-04
**Context:** Migrated from `eslint-config-next@15` + ESLint 10 to `eslint-config-next@16` + ESLint 9, replaced `FlatCompat` with native flat config imports.

**Files:**
- `apps/frontend/eslint.config.mjs`
- `apps/frontend/package.json`

---

## CRITICAL

### 1. `--ext` flag is a no-op in ESLint 9

**File:** `package.json`, line 9

```json
"lint": "eslint --ext .js,.jsx,.ts,.tsx .",
```

The `--ext` flag was removed from ESLint 9. It was a legacy CLI option for the old eslintrc system. In ESLint 9 flat config, file targeting is done via `files` globs inside config objects. The flag is silently ignored — ESLint lints all files matched by config `files` patterns regardless.

The `nextCoreWebVitals` base config already targets `**/*.{js,jsx,mjs,ts,tsx,mts,cts}` via its `files` key, so the actual linting scope is correct. But `--ext` creates a false expectation that extension filtering is active.

**Fix:**

```json
"lint": "eslint ."
```

---

## MEDIUM

### 2. Wrong import path for `eslint-config-prettier`

**File:** `eslint.config.mjs`, line 4

```js
import prettierConfig from 'eslint-config-prettier';
```

`eslint-config-prettier@10.x` ships two exports:

- `'eslint-config-prettier'` (default `index.js`) — exports `{ rules: { ... } }` in the **legacy eslintrc shape**. No `name` property.
- `'eslint-config-prettier/flat'` (`flat.js`) — exports `{ name: 'config-prettier', rules: { ... } }` in the proper flat config shape.

ESLint 9 flat config accepts both as config entries (it's lenient about shape), so the current import **does not crash**. But it uses the undocumented legacy path instead of the intended flat config entry point.

**Fix:**

```js
import prettierConfig from 'eslint-config-prettier/flat';
```

---

### 3. `@eslint/eslintrc` is a dead dependency

**File:** `package.json`, line 31

```json
"@eslint/eslintrc": "^3",
```

This package provides the `FlatCompat` utility which was used in the old `eslint.config.mjs`. After the rewrite, `FlatCompat` is no longer imported anywhere. The package is installed (~900KB in `node_modules`) but completely unused.

**Fix:**

```bash
npm uninstall @eslint/eslintrc
```

---

## LOW

### 4. `ignores` block self-references the config file

**File:** `eslint.config.mjs`, lines 14

```js
'*.config.mjs',   // matches eslint.config.mjs itself
```

ESLint 9 always processes its own config file regardless of `ignores`, so this has no effect on the config file itself. But it also suppresses linting of other `.config.mjs` files (`vitest.config.mjs`, etc.). This is almost certainly intentional — config files rarely need linting — but worth confirming.

---

### 5. `prettierConfig` applies globally with no `files` scope

**File:** `eslint.config.mjs`, line 20

```js
prettierConfig,
```

The imported config has no `files` property, so it applies to every file ESLint processes. This is the standard pattern for prettier configs (you want formatting rules disabled globally), and is consistent with how every other project uses it.

---

### 6. Config ordering is correct

**File:** `eslint.config.mjs`, lines 18–31

```js
...nextCoreWebVitals,    // react/react-hooks rules
...nextTypescript,       // @typescript-eslint rules
prettierConfig,          // disables formatting rules (AFTER other configs ✓)
{
  plugins: { prettier: prettierPlugin },
  rules: { 'prettier/prettier': 'error' },
}
```

Prettier config comes after all rule-defining configs, which is the textbook correct order. The custom prettier plugin block comes last. No conflicts.

---

## INFO / VERIFIED OK

### 7. Import paths are valid

- `eslint-config-next/core-web-vitals` → `dist/core-web-vitals.js` (exists, returns array)
- `eslint-config-next/typescript` → `dist/typescript.js` (exists, returns array)
- `eslint-plugin-prettier` → `eslint-plugin-prettier.js` (exists, has `rules` property)

### 8. Plugin registration is correct

```js
plugins: {
  prettier: prettierPlugin,  // has { meta, configs, rules } — valid for ESLint 9
},
```

### 9. `react-hooks/set-state-in-effect` is a real rule

Confirmed in `eslint-plugin-react-hooks@7.0.1` bundled with `eslint-config-next@16.1.6`:

```
node_modules/eslint-config-next/node_modules/eslint-plugin-react-hooks/
  cjs/eslint-plugin-react-hooks.development.js
    line 18137: name: 'set-state-in-effect',
```

The `'off'` override is valid and takes effect.

### 10. Flat config array structure is correctly formed

The exported value is a flat array. Spread operators on `nextCoreWebVitals` and `nextTypescript` are correct — both exports are arrays. The standalone `{ ignores: [...] }` object as the first entry is the correct flat config pattern for global ignores.

### 11. `eslint-config-prettier` peer dep range

`eslint-plugin-prettier@5.5.5` requires `eslint-config-prettier >= 7.0.0 <10.0.0 || >=10.1.0`. The installed version is `10.1.8`, which satisfies `>=10.1.0`. No risk.

### 12. `vitest@^4` and Node 22

Vitest 4.x requires Node 18+. Node 22 is fully supported. No compatibility issue.
