import { describe, expect, it } from 'vitest';
import { scanSource } from '../scripts/swiss-guard.mjs';

const rulesIn = (src: string, file = 'components/demo/demo.tsx'): string[] =>
  scanSource(file, src).map((hit: { rule: string }) => hit.rule);

describe('Swiss guard rules', () => {
  it.each([
    ['radius', '<div className="rounded-lg" />'],
    ['radius', '<div className="p-2 rounded" />'],
    ['soft-shadow', '<div className="shadow-md" />'],
    ['soft-shadow', '<div className="shadow-[0_1px_2px_black]" />'],
    ['gradient', '<div className="bg-gradient-to-r" />'],
    ['palette', '<p className="text-amber-700" />'],
    ['palette', '<p className="hover:bg-blue-800" />'],
    ['raw-colour', '<div className="bg-[#F5F5F0]" />'],
    ['raw-colour', "const s = { color: '#1D4ED8' };"],
    ['raw-colour', "const s = { boxShadow: '0 0 1px rgba(0,0,0,0.1)' };"],
    ['ink-tint', '<p className="text-black/60" />'],
    ['dark', '<p className="dark:bg-ink" />'],
    ['type-size', '<p className="text-[10px]" />'],
    ['spacing', '<div className="gap-5" />'],
    ['spacing', '<div className="py-0.5" />'],
    ['spacing', '<div className="-mt-10" />'],
    ['transition', '<div className="transition-all" />'],
    ['keyframes', '<div className="animate-pulse" />'],
    ['legacy-token', '<p className="text-steel-grey" />'],
    ['legacy-token', '<p className="bg-secondary" />'],
    ['decorative-icon', "import { X, Sparkles } from 'lucide-react';"],
    ['decorative-icon', "import {\n  X,\n  Zap,\n} from 'lucide-react';"],
    ['motion-import', "import { motion } from 'motion/react';"],
    ['motion-import', "import { motion } from 'framer-motion';"],
    ['glyph', '<span>✓</span>'],
    ['glyph', '<li><span>•</span> tip</li>'],
  ])('flags %s in %s', (rule, src) => {
    expect(rulesIn(src)).toContain(rule);
  });

  it.each([
    '<div className="rounded-none shadow-sw-sm hover:shadow-none" />',
    '<div className="bg-primary text-white border-ink p-3 gap-4 px-6 mt-12" />',
    '/* bg-[#1D4ED8] rounded-lg */ <div />',
    '// shadow-md and #ffffff in a comment\n<div />',
    '<a href="https://github.com/srbhr/Resume-Matcher">x</a>',
    "import { m, AnimatePresence } from 'motion/react';",
    "<p>{'// '}subtitle</p>",
    '<div className="transition-colors animate-spin top-5 w-2.5" />',
    "import { Check, Plus } from 'lucide-react';",
  ])('allows %s', (src) => {
    expect(rulesIn(src)).toEqual([]);
  });

  it('lets primitives use half-step spacing for optical padding', () => {
    expect(rulesIn('<b className="ps-4 pe-3.5" />', 'components/ui/button.tsx')).toEqual([]);
    expect(rulesIn('<b className="ps-4 pe-3.5" />', 'components/builder/x.tsx')).toContain(
      'spacing'
    );
  });

  it('reports 1-based line numbers', () => {
    const [hit] = scanSource('components/x.tsx', 'a\nb\n<div className="rounded-lg" />');
    expect(hit.line).toBe(3);
  });
});
