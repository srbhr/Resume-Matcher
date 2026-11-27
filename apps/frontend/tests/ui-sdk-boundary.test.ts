import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** ui-sdk sits behind the Swiss wrappers in components/ui; nothing else imports it. */
describe('ui-sdk stays behind components/ui', () => {
  const root = path.join(__dirname, '..');
  const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) return sources(full);
      return /\.(?:[cm]?[jt]sx?|css)$/.test(name) ? [full] : [];
    });

  // Any quoted @ui-sdk specifier: static, side-effect, dynamic, require or CSS import.
  const IMPORTS_UI_SDK =
    /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*|@import\s+(?:url\()?)['"]@ui-sdk(?:\/|['"])/;

  it('recognises every way of importing it', () => {
    for (const line of [
      "import { Tabs } from '@ui-sdk/react/tabs';",
      'import { Tabs } from "@ui-sdk/react/tabs";',
      "import '@ui-sdk/core/web.css';",
      "const m = await import('@ui-sdk/react/menu');",
      "const m = require('@ui-sdk/react');",
      "@import '@ui-sdk/core/web.css' layer(components);",
    ]) {
      expect(IMPORTS_UI_SDK.test(line), line).toBe(true);
    }
    expect(IMPORTS_UI_SDK.test("import { cn } from '@/lib/utils';")).toBe(false);
  });

  it('only components/ui wrappers import @ui-sdk', () => {
    const outside = ['app', 'components', 'hooks', 'lib']
      .flatMap((dir) => sources(path.join(root, dir)))
      .filter((file) => !file.startsWith(path.join(root, 'components', 'ui') + path.sep))
      .filter((file) => IMPORTS_UI_SDK.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(root, file));

    expect(outside).toEqual([]);
  });
});
