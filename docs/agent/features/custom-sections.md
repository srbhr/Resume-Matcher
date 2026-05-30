# Custom Sections System

> **Dynamic resume sections with full customization.**

## Section Types

| Type           | Description                                             | Example Uses                                       |
| -------------- | ------------------------------------------------------- | -------------------------------------------------- |
| `personalInfo` | Special type for header (always first)                  | Name, contact details                              |
| `text`         | Single text block                                       | Summary, objective, statement                      |
| `itemList`     | Array of items with title, subtitle, years, description | Experience, projects, publications                 |
| `stringList`   | Simple array of strings                                 | Skills, languages, hobbies                         |
| `labeledLists` | Multiple titled lists (label + items)                   | Technical Skills, Languages; Frameworks, Databases |

## Section Features

- **Rename sections**: Change display names (e.g., "Education" → "Academic Background")
- **Reorder sections**: Up/down buttons to change section order
- **Hide sections**: Toggle visibility (hidden sections still editable, just not in PDF)
- **Delete sections**: Remove custom sections entirely
- **Add custom sections**: Create new sections with any name and type

## Section Controls (UI)

Each section (except Personal Info) has these controls in the header:

| Control    | Icon           | Function                          |
| ---------- | -------------- | --------------------------------- |
| Visibility | 👁 Eye / EyeOff | Toggle show/hide in PDF preview   |
| Move Up    | ⬆ ChevronUp    | Move section earlier in order     |
| Move Down  | ⬇ ChevronDown  | Move section later in order       |
| Rename     | ✏️ Pencil       | Edit section display name         |
| Delete     | 🗑 Trash        | Hide (default) or delete (custom) |

## Hidden Section Behavior

- Hidden sections appear in the form with:
  - Dashed border and 60% opacity
  - "Hidden from PDF" badge (amber)
- Hidden sections are still editable
- Only PDF/preview hides them (uses `getSortedSections` which filters by visibility)
- Form shows all sections (uses `getAllSections`)

## Key Files

| File                                                         | Purpose                                              |
| ------------------------------------------------------------ | ---------------------------------------------------- |
| `apps/backend/app/schemas/models.py`                         | `SectionType`, `SectionMeta`, `CustomSection` models |
| `apps/frontend/lib/utils/section-helpers.ts`                 | Section management utilities                         |
| `apps/frontend/components/builder/section-header.tsx`        | Section controls UI                                  |
| `apps/frontend/components/builder/add-section-dialog.tsx`    | Add custom section dialog                            |
| `apps/frontend/components/builder/resume-form.tsx`           | Dynamic form rendering                               |
| `apps/frontend/components/resume/dynamic-resume-section.tsx` | Renders custom sections in templates                 |

## Labeled Lists (labeledLists)

The `labeledLists` section type allows creating multiple titled subsections, each containing comma-separated items. This is useful for organizing related information into categories without the overhead of full item entries.

### Rendering

Renders in a two-column layout with bold labels on the left:

```
Technical Skills:  Python, React, TypeScript, Node.js
Languages:         English, Spanish, Mandarin
Certifications:    AWS Solutions Architect, Google Analytics
```

### Data Format (Backend)

```python
class LabeledListItem(BaseModel):
    id: int
    label: str                    # e.g., "Technical Skills"
    items: list[str]             # e.g., ["Python", "React", "TypeScript"]

# Inside CustomSection:
namedLists: list[LabeledListItem] | None = None
```

### Data Format (Frontend)

```typescript
interface LabeledListItem {
  id: number;
  label: string;
  items: string[];
}

// Inside CustomSection:
namedLists?: LabeledListItem[];
```

### Example Usage

```json
{
  "sectionMeta": [
    {
      "id": "custom_1",
      "key": "custom_1",
      "displayName": "Technical Skills",
      "sectionType": "labeledLists",
      "isDefault": false,
      "isVisible": true,
      "order": 6
    }
  ],
  "customSections": {
    "custom_1": {
      "sectionType": "labeledLists",
      "namedLists": [
        {"id": 1, "label": "Languages", "items": ["Python", "Go", "Rust"]},
        {"id": 2, "label": "Frontend", "items": ["React", "Vue", "TypeScript"]},
        {"id": 3, "label": "Databases", "items": ["PostgreSQL", "MongoDB", "Redis"]}
      ]
    }
  }
}
```

### UI Features

- **Add subsections**: Click "Add Subsection" to add new labeled lists
- **Remove subsections**: Hover over a subsection and click the trash icon
- **Reorder subsections**: Use up/down arrows to move subsections (hover to show)
- **Edit label**: Click on the label input to change the subsection title
- **Edit items**: Enter items separated by newlines in the textarea

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
