# Custom Sections System

> **Dynamic resume sections with full customization.**

## Section Types

| Type | Description | Example Uses |
|------|-------------|--------------|
| `personalInfo` | Special type for header (always first) | Name, contact details |
| `text` | Single text block | Summary, objective, statement |
| `itemList` | Array of items with title, subtitle, years, description | Experience, projects, publications |
| `stringList` | Simple array of strings | Skills, languages, hobbies |

## Section Features

- **Rename sections**: Change display names (e.g., "Education" → "Academic Background")
- **Reorder sections**: Up/down buttons to change section order
- **Hide sections**: Toggle visibility (hidden sections still editable, just not in PDF)
- **Delete sections**: Remove custom sections entirely
- **Duplicate sections**: Copy a custom section (custom sections only)
- **Add custom sections**: Create new sections with any name and type

## Section Controls (UI)

Each section (except Personal Info) has these controls in the header:

| Control | Icon | Function |
|---------|------|----------|
| Visibility | 👁 Eye / EyeOff | Toggle show/hide in PDF preview |
| Move Up | ⬆ ChevronUp | Move section earlier in order |
| Move Down | ⬇ ChevronDown | Move section later in order |
| Rename | ✏️ Pencil | Edit section display name |
| Delete | 🗑 Trash | Hide (default) or delete (custom) |
| Duplicate | ⧉ Copy | Copy the whole section (custom sections only) |

## Duplicating

- **Entries:** the experience, education, projects and custom item-list forms each have a per-entry Duplicate button. The copy is deep-cloned and inserted directly below the original with the next free id (`max + 1`, the same rule as the "add" buttons). Helper: `duplicateById` in `lib/utils/reorder-items.ts`.
- **Whole sections (custom only):** the header Copy button clones the section's data and metadata as `"<name> (Copy)"` (suffix from the `builder.copySuffix` i18n key), placed directly below the original. Later sections shift down by one so `order` stays unique. Built-in sections have no Copy button; their entries can still be duplicated one by one. Helper: `duplicateCustomSection` in `lib/utils/section-helpers.ts`.
- Both only edit builder state; nothing is saved until the normal save/autosave. To copy a whole resume, see `POST /resumes/{id}/duplicate` in the [API doc](../apis/front-end-apis.md#master-resumes-career-tracks).

## Hidden Section Behavior

- Hidden sections appear in the form with:
  - Dashed border and 60% opacity
  - "Hidden from PDF" badge (amber)
- Hidden sections are still editable
- Only PDF/preview hides them (uses `getSortedSections` which filters by visibility)
- Form shows all sections (uses `getAllSections`)

## Key Files

| File | Purpose |
|------|---------|
| `apps/backend/app/schemas/models.py` | `SectionType`, `SectionMeta`, `CustomSection` models |
| `apps/frontend/lib/utils/section-helpers.ts` | Section management utilities (incl. `duplicateCustomSection`) |
| `apps/frontend/lib/utils/reorder-items.ts` | Item reorder/duplicate helpers (`duplicateById`) |
| `apps/frontend/components/builder/section-header.tsx` | Section controls UI |
| `apps/frontend/components/builder/add-section-dialog.tsx` | Add custom section dialog |
| `apps/frontend/components/builder/resume-form.tsx` | Dynamic form rendering |
| `apps/frontend/components/resume/dynamic-resume-section.tsx` | Renders custom sections in templates |

## Data Structure

```typescript
interface ResumeData {
  // ... existing fields (personalInfo, summary, etc.)
  sectionMeta?: SectionMeta[];  // Section order, names, visibility
  customSections?: Record<string, CustomSection>;  // Custom section data
}
```

## Migration

Existing resumes are automatically migrated via lazy normalization - default section metadata is added when a resume is fetched if `sectionMeta` is missing.

> **Important**: The `normalize_resume_data()` function uses `copy.deepcopy(DEFAULT_SECTION_META)` to avoid shared mutable reference bugs. Always use deep copies when assigning default mutable values.
