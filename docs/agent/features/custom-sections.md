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
| `apps/frontend/lib/utils/section-helpers.ts` | Section management utilities |
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
