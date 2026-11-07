/**
 * Skill rows for the resume templates.
 *
 * technicalSkills stays a flat list of lines. Two kinds of line shape the layout:
 *   "Molecular Biology: PCR, qPCR"   a labeled row: the label, then its skills
 *   "---"                             ends the current row
 * Any other line is one skill in the current unlabeled row. A label with
 * nothing after the colon ("Microbiology:") collects the skills on the lines
 * below it, until the next label or "---".
 */
export const SKILL_ROW_BREAK = '---';

export interface SkillRow {
  label?: string;
  items: string[];
}

// A short label without commas, then a colon at the end or before a space, so
// "ISO 9001:2015" and URLs stay plain skills. CJK text uses the full-width colon
// with no space ("实验室：PCR"), so that one needs none.
const LABELED_LINE = /^([^,:：，、]{1,40})(?::(?:\s+(.*))?|：\s*(.*))$/;

export const isSkillRowBreak = (item: string): boolean => item.trim() === SKILL_ROW_BREAK;

/** Split on commas outside parentheses and brackets: "BLAST (MEGA, R)" stays whole. */
function splitSkills(text: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if ('([（'.includes(char)) depth++;
    else if (')]）'.includes(char) && depth > 0) depth--;
    else if (',，、'.includes(char) && depth === 0) {
      items.push(text.slice(start, i));
      start = i + 1;
    }
  }
  items.push(text.slice(start));
  return items.map((item) => item.trim()).filter(Boolean);
}

export function groupSkills(lines: string[]): SkillRow[] {
  const rows: SkillRow[] = [];
  let open: SkillRow | null = null;
  for (const raw of lines) {
    const line = typeof raw === 'string' ? raw.trim() : '';
    if (!line) continue;
    if (line === SKILL_ROW_BREAK) {
      open = null;
      continue;
    }
    const match = LABELED_LINE.exec(line);
    const label = match?.[1].trim();
    if (match && label) {
      const row: SkillRow = { label, items: splitSkills(match[2] ?? match[3] ?? '') };
      rows.push(row);
      open = row.items.length === 0 ? row : null;
      continue;
    }
    if (!open) {
      open = { items: [] };
      rows.push(open);
    }
    open.items.push(line);
  }
  return rows.filter((row) => row.items.length > 0);
}

/** True when the list has no labels or breaks, so templates keep their plain layout. */
export const isPlainSkillList = (rows: SkillRow[]): boolean => rows.length <= 1 && !rows[0]?.label;

/**
 * Rows for templates that print "Label: a, b, c" lines. A group keeps its own
 * label; the first unlabeled row takes `fallbackLabel` ("Technical Skills:"),
 * later ones none, so a plain list prints exactly as before.
 */
export function labeledSkillRows(
  lines: string[],
  fallbackLabel: string
): { label: string; items: string[] }[] {
  let fallback = fallbackLabel;
  return groupSkills(lines).map((row) => {
    if (row.label) return { label: `${row.label}:`, items: row.items };
    const label = fallback;
    fallback = '';
    return { label, items: row.items };
  });
}
