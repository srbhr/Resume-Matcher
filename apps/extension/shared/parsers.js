// apps/extension/shared/parsers.js
// Pure functions — no Chrome APIs. Loaded by content scripts (via manifest) and popup (via <script>).

const _LANGUAGES = [
  ['German',     ['german', 'deutsch']],
  ['English',    ['english']],
  ['French',     ['french', 'français', 'francais']],
  ['Spanish',    ['spanish', 'español', 'espanol']],
  ['Mandarin',   ['mandarin', 'chinese']],
  ['Dutch',      ['dutch', 'nederlands']],
  ['Italian',    ['italian']],
  ['Portuguese', ['portuguese']],
  ['Japanese',   ['japanese']],
  ['Korean',     ['korean']],
  ['Arabic',     ['arabic']],
  ['Russian',    ['russian']],
  ['Polish',     ['polish']],
  ['Swedish',    ['swedish']],
  ['Danish',     ['danish']],
  ['Finnish',    ['finnish']],
  ['Norwegian',  ['norwegian']],
  ['Turkish',    ['turkish']],
  ['Hindi',      ['hindi']],
];

const _LEVEL_PATTERNS = [
  [/\b(native|mother\s*tongue|bilingual)\b/i,           'Native'],
  [/\b(fluent|full\s*professional\s*proficiency)\b/i,   'Fluent'],
  [/\bprofessional\s*working\s*proficiency\b/i,         'Professional'],
  [/\b(professional|proficient)\b/i,                    'Professional'],
  [/\b(conversational|intermediate)\b/i,                'Conversational'],
  [/\b([ABC][12])\b/,                                   null], // CEFR: A1-C2, use match directly
];

function parseLanguages(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  const results = [];
  const seen = new Set();

  for (const [normalizedName, aliases] of _LANGUAGES) {
    if (seen.has(normalizedName)) continue;

    // Find the earliest mention of any alias
    let firstIdx = -1;
    let matchedAliasLen = 0;
    for (const alias of aliases) {
      const regex = new RegExp(`\\b${alias}\\b`, 'i');
      const m = regex.exec(text);
      if (m && (firstIdx === -1 || m.index < firstIdx)) {
        firstIdx = m.index;
        matchedAliasLen = alias.length;
      }
    }
    if (firstIdx === -1) continue;

    // Context window: 80 chars before and after the mention
    const ctx = text.slice(Math.max(0, firstIdx - 80), firstIdx + matchedAliasLen + 80);

    // Detect level
    let level = null;
    for (const [pattern, levelName] of _LEVEL_PATTERNS) {
      const m = ctx.match(pattern);
      if (m) {
        level = levelName !== null ? levelName : m[1]; // CEFR uses the captured group
        break;
      }
    }

    // Detect required vs preferred
    const required = !/\b(preferred|nice\s*to\s*have|plus|advantage|bonus|desirable)\b/i.test(ctx);

    results.push({ language: normalizedName, level: level || null, required });
    seen.add(normalizedName);
  }

  return results;
}

function parseVisa(text) {
  if (!text) return 'unclear';
  const lower = text.toLowerCase();

  const notAvailable = [
    'no sponsorship',
    'not able to sponsor',
    'unable to sponsor',
    'cannot sponsor',
    'does not sponsor',
    'will not sponsor',
    'must be authorized',
    'must have the right to work',
    'must have right to work',
    'no visa',
    'work authorization required',
    'authorized to work in',
    'right to work in',
  ];

  const available = [
    'visa sponsorship available',
    'visa sponsorship provided',
    'sponsor work visa',
    'we sponsor',
    'sponsorship available',
    'visa support',
    'relocation assistance',
    'visa assistance',
  ];

  for (const p of notAvailable) {
    if (lower.includes(p)) return 'not_available';
  }
  for (const p of available) {
    if (lower.includes(p)) return 'available';
  }
  return 'unclear';
}

// CommonJS export guard — allows Node.js require() in tests
// while still running as a plain script in the browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseLanguages, parseVisa };
}
