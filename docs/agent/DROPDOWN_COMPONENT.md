# Custom Dropdown Component

## Overview

Created a Swiss International Style (Brutalist) dropdown component that matches the design system with:

### Visual Features

- **No rounded corners** (`rounded-none`)
- **Hard black border** (2px) with no blur
- **Hard shadows** (2px 2px 0px 0px for button, 4px 4px for menu)
- **Monospace typography** (font-mono)
- **Green highlight** (#15803D) for selected options with checkmark
- **Hover effects** with translate (1px/2px shift)
- **Full descriptions** displayed in dropdown options

### Component Structure

#### Trigger Button

```
┌─────────────────────────────────────────┐
│ Label (optional, uppercase monospace)  │
│ Description (optional, smaller text)   │
├─────────────────────────────────────────┤
│ ┌────────────────────────────────────┐ │
│ │ Selected Option Label              │ │
│ │ Selected Option Description    ▼   │ │
│ └────────────────────────────────────┘ │ shadow: 2px 2px 0px
└─────────────────────────────────────────┘
```

#### Dropdown Menu (on click)

```
┌─────────────────────────────────────┐
│ Option 1 Label                  │ ✓ │
│ Option 1 Description                │
├─────────────────────────────────────┤
│ Option 2 Label                      │
│ Option 2 Description                │
├─────────────────────────────────────┤
│ Option 3 Label (green bg/white) │ ✓ │
│ Option 3 Description                │
└─────────────────────────────────────┘
  shadow: 4px 4px 0px 0px rgba(0,0,0,0.1)
```

### Interactive Behavior

| State | Background | Text | Shadow | Cursor |
|-------|-----------|------|--------|--------|
| Default | white | black | 2px shadow | pointer |
| Hover | gray-50 | black | 2px shadow | pointer |
| Active/Pressed | gray-100 | black | none | pointer |
| Selected option | green-700 | white | none | pointer |
| Disabled | white | gray (50% opacity) | 2px shadow | not-allowed |

### Hover Animation (Button)

- **Transform**: `translate-y-[2px] translate-x-[2px]`
- **Shadow**: Removed on hover (button moves into shadow space)
- **Duration**: 150ms ease-out

### Keyboard & Click Behavior

- **Click outside**: Closes dropdown
- **Click option**: Selects and closes
- **Disabled state**: Blocks all interactions

---

## Usage

### In Tailor Page

```tsx
<Dropdown
  options={promptOptions}
  value={selectedPromptId}
  onChange={setSelectedPromptId}
  label={t('tailor.promptLabel')}
  description={t('tailor.promptDescription')}
  disabled={isLoading || promptLoading}
/>
```

### In Settings Page

```tsx
<Dropdown
  options={promptOptions}
  value={defaultPromptId}
  onChange={handlePromptConfigChange}
  label={t('settings.promptSettings.title')}
  description={t('settings.promptSettings.description')}
  disabled={promptConfigLoading}
/>
```

### Option Structure

```typescript
interface DropdownOption {
  id: string;              // Unique identifier
  label: string;           // Display label
  description?: string;    // Optional description
}
```

---

## Files Modified/Created

1. **Created**: `apps/frontend/components/ui/dropdown.tsx`
   - Custom Dropdown component (134 lines)
   - Full TypeScript with proper types
   - Keyboard/click handlers
   - Accessibility-focused

2. **Modified**: `apps/frontend/app/(default)/tailor/page.tsx`
   - Replaced native `<select>` with `<Dropdown>`
   - Removed redundant label/description divs
   - Cleaner markup

3. **Modified**: `apps/frontend/app/(default)/settings/page.tsx`
   - Already updated with Dropdown component
   - Integrated with prompt config handler

---

## Design Compliance

✓ Swiss International Style principles
✓ No rounded corners anywhere
✓ Hard black borders and shadows
✓ Monospace typography for controls
✓ Green (#15803D) for selection (matches Signal Green)
✓ Hover translate effects
✓ Full accessibility support
✓ Lean, minimal implementation (no shadCN, no stores)
