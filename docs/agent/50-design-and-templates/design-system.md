# Design System Documentation

> **Last Updated:** December 27, 2024
> **Style:** Swiss International Style (Brutalist)
> **Framework:** Tailwind CSS with custom design tokens

---

## 1. Design Philosophy

The Resume Matcher uses **Swiss International Style** (also known as International Typographic Style), characterized by:

- **Grid-based layouts** - Strong vertical and horizontal alignment
- **Sans-serif typography** - Clean, legible fonts
- **Asymmetric compositions** - Intentional visual tension
- **Hard shadows** - Depth without blur (Brutalist element)
- **High contrast** - Black borders, strong color blocks
- **No rounded corners** - All elements use `rounded-none`
- **Functional minimalism** - Every element serves a purpose

---

## 2. Color Palette

### 2.1 Primary Colors

| Name | Hex | Tailwind | Usage |
|------|-----|----------|-------|
| Hyper Blue | #1D4ED8 | `blue-700` | Primary CTAs, links, selected states |
| Black | #000000 | `black` | Text, borders, shadows |
| White | #FFFFFF | `white` | Card backgrounds, text on dark |

### 2.2 Semantic Colors

| Name | Hex | Tailwind | Usage |
|------|-----|----------|-------|
| Signal Green | #15803D | `green-700` | Success, download, ready status |
| Alert Red | #DC2626 | `red-600` | Destructive actions, errors |
| Alert Orange | #F97316 | `orange-500` | Warnings, caution |
| Amber | #F59E0B | `amber-500` | Setup required status |

### 2.3 Neutral Colors

| Name | Hex | Tailwind | Usage |
|------|-----|----------|-------|
| Warm White | #F0F0E8 | custom | Page backgrounds, cards |
| Panel Grey | #E5E5E0 | custom | Secondary panels, disabled |
| Light Grey | #D8D8D2 | custom | Filler cards, borders |
| Dark Grey | #374151 | `gray-700` | Secondary text |
| Light Text | #6B7280 | `gray-500` | Tertiary text, hints |


---

## 3. Typography

### 3.1 Font Families

| Family | Tailwind Class | Font Stack | Usage |
|--------|----------------|------------|-------|
| Serif | `font-serif` | Merriweather, Georgia, serif | Headlines, resume headers |
| Sans | `font-sans` | Inter, system-ui, sans-serif | Body text, descriptions |
| Mono | `font-mono` | JetBrains Mono, monospace | Labels, status, code |

### 3.2 Font Loading (app/layout.tsx)

```typescript
import { Inter, Merriweather, JetBrains_Mono } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
const merriweather = Merriweather({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-serif'
});
const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono'
});
```

### 3.3 Type Scale

| Size | Class | Pixels | Usage |
|------|-------|--------|-------|
| 3xl | `text-3xl` | 30px | Page titles |
| 2xl | `text-2xl` | 24px | Section headers |
| xl | `text-xl` | 20px | Subsection headers |
| lg | `text-lg` | 18px | Large body |
| base | `text-base` | 16px | Body text |
| sm | `text-sm` | 14px | Secondary text |
| xs | `text-xs` | 12px | Labels, hints |
| [10px] | `text-[10px]` | 10px | Compact labels |

### 3.4 Text Styles

| Style | Classes | Usage |
|-------|---------|-------|
| Page Title | `font-serif text-3xl font-bold tracking-tight` | SETTINGS, DASHBOARD |
| Section Title | `font-mono text-sm font-bold uppercase tracking-wider` | Panel headers |
| Body | `font-sans text-base text-gray-800` | Descriptions |
| Label | `font-mono text-xs uppercase text-gray-500` | Form labels, status |
| Code | `font-mono text-sm` | Technical values |

---

## 4. Spacing System

### 4.1 Base Spacing (Tailwind Default)

| Token | Value | Classes |
|-------|-------|---------|
| 1 | 4px | `p-1`, `m-1`, `gap-1` |
| 2 | 8px | `p-2`, `m-2`, `gap-2` |
| 3 | 12px | `p-3`, `m-3`, `gap-3` |
| 4 | 16px | `p-4`, `m-4`, `gap-4` |
| 6 | 24px | `p-6`, `m-6`, `gap-6` |
| 8 | 32px | `p-8`, `m-8`, `gap-8` |
| 10 | 40px | `p-10`, `m-10` |
| 12 | 48px | `p-12`, `m-12` |

### 4.2 Common Spacing Patterns

| Pattern | Classes | Usage |
|---------|---------|-------|
| Card padding | `p-6 md:p-8` | Dashboard cards |
| Section gap | `space-y-4` or `gap-4` | Form sections |
| Panel padding | `p-4` | Toolbars, footers |
| Dialog padding | `p-6` | Modal content |

---

## 5. Shadows

### 5.1 Shadow Definitions

| Name | Value | Usage |
|------|-------|-------|
| Swiss-lg | `shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)]` | Cards, dialogs, resume viewer |
| Swiss-md | `shadow-[4px_4px_0px_0px_#000000]` | Buttons, primary actions |
| Swiss-sm | `shadow-[2px_2px_0px_0px_#000000]` | Form inputs, status cards |
| Page | `shadow-[6px_6px_0px_0px_#000000]` | Preview pages |

### 5.2 Interactive Shadow Pattern

```css
/* Default state */
.element {
  shadow-[2px_2px_0px_0px_#000000];
}

/* Hover state - shadow moves with element */
.element:hover {
  translate-y-[1px];
  translate-x-[1px];
  shadow-none;
}

/* Active state */
.element:active {
  translate-y-[2px];
  translate-x-[2px];
}
```

---

## 6. Component Catalog

### 6.1 Button (`components/ui/button.tsx`)

**Location:** `apps/frontend/components/ui/button.tsx`

**Base Classes:**
```typescript
const baseStyles = cn(
  'inline-flex items-center justify-center gap-2',
  'whitespace-nowrap text-sm font-medium font-mono uppercase tracking-wide',
  'transition-all duration-150 ease-out',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2',
  'disabled:pointer-events-none disabled:opacity-50',
  "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0",
  'rounded-none'
);
```

**Variants:**

| Variant | Background | Text | Shadow | Hover |
|---------|------------|------|--------|-------|
| `default` | `bg-blue-700` | `text-white` | Yes | `bg-blue-800` + translate |
| `destructive` | `bg-red-600` | `text-white` | Yes | `bg-red-700` + translate |
| `success` | `bg-green-700` | `text-white` | Yes | `bg-green-800` + translate |
| `warning` | `bg-orange-500` | `text-white` | Yes | `bg-orange-600` + translate |
| `outline` | `bg-transparent` | `text-black` | Yes | `bg-gray-100` + translate |
| `secondary` | `bg-[#E5E5E0]` | `text-black` | Yes | `bg-[#D8D8D2]` + translate |
| `ghost` | `bg-transparent` | `text-black` | No | `bg-gray-100` |
| `link` | `bg-transparent` | `text-blue-700` | No | `underline` |

**Sizes:**

| Size | Height | Padding | Font |
|------|--------|---------|------|
| `default` | h-10 | px-6 py-2 | text-sm |
| `sm` | h-8 | px-4 py-1 | text-xs |
| `lg` | h-12 | px-8 py-3 | text-base |
| `icon` | h-10 w-10 | p-0 | - |

**Usage:**
```tsx
<Button variant="default">Save</Button>
<Button variant="destructive"><Trash2 /> Delete</Button>
<Button variant="success"><Download /> Download</Button>
<Button variant="outline" size="sm"><ArrowLeft /> Back</Button>
<Button variant="ghost" size="icon"><RefreshCw /></Button>
```

### 6.2 Input (`components/ui/input.tsx`)

**Location:** `apps/frontend/components/ui/input.tsx`

**Classes:**
```typescript
'flex h-9 w-full border border-black bg-transparent px-3 py-1 text-sm',
'shadow-sm transition-colors',
'file:border-0 file:bg-transparent file:text-sm file:font-medium',
'placeholder:text-gray-400',
'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-700',
'disabled:cursor-not-allowed disabled:opacity-50',
'rounded-none'
```

**Usage:**
```tsx
<Input placeholder="Enter email..." />
<Input type="password" placeholder="API Key..." />
<Input disabled />
```

### 6.3 Textarea (`components/ui/textarea.tsx`)

**Location:** `apps/frontend/components/ui/textarea.tsx`

**Classes:**
```typescript
'flex min-h-[80px] w-full border border-black bg-transparent px-3 py-2 text-sm',
'placeholder:text-gray-400',
'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-700',
'disabled:cursor-not-allowed disabled:opacity-50',
'rounded-none'
```

**Usage:**
```tsx
<Textarea
  placeholder="Paste job description..."
  className="min-h-[300px] resize-none"
/>
```

### 6.4 Label (`components/ui/label.tsx`)

**Location:** `apps/frontend/components/ui/label.tsx`

**Classes:**
```typescript
'font-mono text-sm uppercase tracking-wider'
```

**Usage:**
```tsx
<Label htmlFor="email">Email Address</Label>
```

### 6.5 Dialog (`components/ui/dialog.tsx`)

**Location:** `apps/frontend/components/ui/dialog.tsx`
**Based on:** Radix UI Dialog

**Parts:**

| Part | Purpose | Key Classes |
|------|---------|-------------|
| `DialogTrigger` | Opens dialog | - |
| `DialogOverlay` | Background overlay | `bg-black/50` |
| `DialogContent` | Modal container | `rounded-none border border-black shadow-lg` |
| `DialogHeader` | Title section | `border-b border-black p-6` |
| `DialogTitle` | Heading | `font-serif text-xl font-bold uppercase` |
| `DialogDescription` | Subtext | `font-mono text-xs text-gray-600` |
| `DialogFooter` | Actions | `bg-[#F0F0E8] p-4 border-t border-black` |
| `DialogClose` | Close button | - |

### 6.6 ConfirmDialog (`components/ui/confirm-dialog.tsx`)

**Location:** `apps/frontend/components/ui/confirm-dialog.tsx`

**Props:**
```typescript
interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;      // Default: "Confirm"
  cancelLabel?: string;       // Default: "Cancel"
  onConfirm: () => void;
  variant?: 'danger' | 'warning' | 'default' | 'success';
  icon?: React.ReactNode;
  showCancelButton?: boolean; // Default: true
}
```

**Variant Styling:**

| Variant | Icon Background | Icon Color | Button Variant | Default Icon |
|---------|-----------------|------------|----------------|--------------|
| danger | `bg-red-100 border-red-300` | `text-red-600` | destructive | Trash2 |
| warning | `bg-orange-100 border-orange-300` | `text-orange-600` | warning | AlertTriangle |
| success | `bg-green-100 border-green-300` | `text-green-700` | success | CheckCircle2 |
| default | `bg-blue-100 border-blue-300` | `text-blue-700` | default | AlertTriangle |

**Structure:**
```
┌─────────────────────────────────────┐
│  ┌────┐  TITLE                      │
│  │ICON│  Description text here      │
│  └────┘                             │
├─────────────────────────────────────┤
│             [Cancel] [Confirm]      │
└─────────────────────────────────────┘
```

**Usage:**
```tsx
<ConfirmDialog
  open={showDeleteDialog}
  onOpenChange={setShowDeleteDialog}
  title="Delete Resume"
  description="This action cannot be undone."
  confirmLabel="Delete Resume"
  cancelLabel="Keep Resume"
  onConfirm={handleDelete}
  variant="danger"
/>
```

---

## 7. Layout Patterns

### 7.1 Page Container

```tsx
<div className="min-h-screen bg-[#F0F0E8] py-12 px-4 md:px-8">
  <div className="max-w-7xl mx-auto">
    {/* Page content */}
  </div>
</div>
```

### 7.2 Swiss Grid (`components/home/swiss-grid.tsx`)

**Purpose:** Dashboard card grid layout

**Classes:**
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
  {children}
</div>
```

**Card Base:**
```tsx
const cardBaseClass = 'bg-[#F0F0E8] p-6 md:p-8 aspect-square h-full relative flex flex-col';
const interactiveCardClass = `${cardBaseClass} transition-all duration-200 ease-in-out hover:-translate-y-1 hover:-translate-x-1 hover:shadow-[6px_6px_0px_0px_#000000] cursor-pointer group`;
```

### 7.3 Two-Panel Layout (Builder)

```tsx
<div className="flex flex-col lg:flex-row h-[calc(100vh-80px)]">
  {/* Left Panel - Editor */}
  <div className="w-full lg:w-1/2 overflow-y-auto border-r border-black">
    <div className="flex items-center gap-2 border-b border-gray-400 p-4">
      <div className="w-3 h-3 bg-blue-700"></div>
      <h2 className="font-mono text-lg font-bold text-gray-600 uppercase">
        Editor Panel
      </h2>
    </div>
    {/* Form content */}
  </div>

  {/* Right Panel - Preview */}
  <div className="w-full lg:w-1/2 bg-[#E5E5E0] overflow-hidden">
    <div className="flex items-center gap-2 border-b border-gray-400 p-4">
      <div className="w-3 h-3 bg-green-700"></div>
      <h2 className="font-mono text-lg font-bold text-gray-600 uppercase">
        Live Preview
      </h2>
    </div>
    {/* Preview content */}
  </div>
</div>
```

### 7.4 Settings Page Layout

```tsx
<div className="w-full max-w-4xl border border-black bg-[#F0F0E8] shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)]">
  {/* Header */}
  <div className="border-b border-black p-8 bg-white">
    <h1 className="font-serif text-3xl font-bold tracking-tight">SETTINGS</h1>
    <p className="font-mono text-xs text-gray-500 mt-2 uppercase">
      // SYSTEM CONFIGURATION
    </p>
  </div>

  {/* Content sections */}
  <div className="p-8 space-y-10">
    {/* Sections */}
  </div>

  {/* Footer */}
  <div className="bg-[#E5E5E0] p-4 border-t border-black flex justify-between">
    <span className="font-mono text-xs text-gray-500">RESUME MATCHER v2.0.0</span>
    {/* Status indicator */}
  </div>
</div>
```

---

## 8. Status Indicators

### 8.1 Processing Status

| Status | Color | Icon | Text |
|--------|-------|------|------|
| loading | gray | Loader2 (spin) | "CHECKING..." |
| pending | gray | - | "PENDING" |
| processing | blue | Loader2 (spin) | "PROCESSING..." |
| ready | green | - | "READY" |
| failed | red | AlertCircle | "PROCESSING FAILED" |

**Implementation:**
```tsx
const getStatusDisplay = () => {
  switch (processingStatus) {
    case 'loading':
      return {
        text: 'CHECKING...',
        icon: <Loader2 className="w-3 h-3 animate-spin" />,
        color: 'text-gray-500',
      };
    case 'ready':
      return { text: 'READY', icon: null, color: 'text-green-700' };
    // ...
  }
};
```

### 8.2 System Status Footer

```tsx
{/* Ready state */}
<div className="flex items-center gap-2">
  <div className="w-3 h-3 bg-green-700"></div>
  <span className="font-mono text-xs font-bold text-green-700">
    STATUS: READY
  </span>
</div>

{/* Setup required */}
<div className="flex items-center gap-2">
  <div className="w-3 h-3 bg-amber-500"></div>
  <span className="font-mono text-xs font-bold text-amber-600">
    STATUS: SETUP REQUIRED
  </span>
</div>

{/* Loading */}
<div className="flex items-center gap-2">
  <Loader2 className="w-3 h-3 animate-spin text-gray-500" />
  <span className="font-mono text-xs text-gray-500">CHECKING...</span>
</div>
```

### 8.3 Health Check Cards

```tsx
<div className="border border-black bg-white p-4 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.1)]">
  <div className="flex items-center gap-2 mb-2">
    <Server className="w-4 h-4 text-gray-500" />
    <span className="font-mono text-xs uppercase text-gray-500">LLM</span>
  </div>
  <div className="flex items-center gap-2">
    {healthy ? (
      <CheckCircle2 className="w-5 h-5 text-green-600" />
    ) : (
      <XCircle className="w-5 h-5 text-red-500" />
    )}
    <span className="font-mono text-sm font-bold">
      {healthy ? 'HEALTHY' : 'OFFLINE'}
    </span>
  </div>
</div>
```

---

## 9. Icons

### 9.1 Icon Library

**Package:** `lucide-react`

**Common Icons Used:**

| Icon | Import | Usage |
|------|--------|-------|
| ArrowLeft | `ArrowLeft` | Back navigation |
| Edit | `Edit` | Edit actions |
| Download | `Download` | Download PDF |
| Trash2 | `Trash2` | Delete actions |
| Plus | `Plus` | Add new items |
| Loader2 | `Loader2` | Loading spinner |
| AlertCircle | `AlertCircle` | Error states |
| AlertTriangle | `AlertTriangle` | Warnings |
| CheckCircle2 | `CheckCircle2` | Success states |
| XCircle | `XCircle` | Error/offline |
| X | `X` | Close, remove |
| XIcon | `XIcon` | Cancel |
| RefreshCw | `RefreshCw` | Refresh |
| Save | `Save` | Save actions |
| Key | `Key` | API key |
| Database | `Database` | Database status |
| Activity | `Activity` | Health check |
| Server | `Server` | LLM status |
| FileText | `FileText` | Documents |
| Briefcase | `Briefcase` | Jobs |
| Sparkles | `Sparkles` | AI/improvements |
| Clock | `Clock` | Time |
| Eye | `Eye` | Show/toggle |
| EyeOff | `EyeOff` | Hide |
| ZoomIn | `ZoomIn` | Zoom controls |
| ZoomOut | `ZoomOut` | Zoom controls |

### 9.2 Icon Sizing

| Context | Size Class | Pixels |
|---------|------------|--------|
| Button icon | `w-4 h-4` | 16px |
| Status icon | `w-3 h-3` | 12px |
| Large icon | `w-5 h-5` | 20px |
| Card icon | `w-6 h-6` | 24px |
| Hero icon | `w-8 h-8` | 32px |

---

## 10. Form Patterns

### 10.1 Form Section

```tsx
<div className="space-y-4">
  {/* Section header with collapse */}
  <button className="flex items-center justify-between w-full text-left">
    <div className="flex items-center gap-2">
      <div className="w-3 h-3 bg-blue-700"></div>
      <h3 className="font-mono text-sm font-bold uppercase">
        Personal Info
      </h3>
    </div>
    <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
  </button>

  {/* Form fields */}
  {isOpen && (
    <div className="space-y-4 pl-5 border-l-2 border-gray-200">
      {/* Fields */}
    </div>
  )}
</div>
```

### 10.2 Form Field

```tsx
<div className="space-y-1">
  <Label htmlFor="name">Full Name</Label>
  <Input
    id="name"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder="John Doe"
    className="font-mono"
  />
</div>
```

### 10.3 Array Field (Bullet Points)

```tsx
<div className="space-y-2">
  <Label>Description</Label>
  {descriptions.map((desc, index) => (
    <div key={index} className="flex gap-2">
      <Input
        value={desc}
        onChange={(e) => updateDescription(index, e.target.value)}
        placeholder="Achievement or responsibility..."
      />
      <Button
        variant="ghost"
        size="icon"
        onClick={() => removeDescription(index)}
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  ))}
  <Button
    variant="outline"
    size="sm"
    onClick={addDescription}
  >
    <Plus className="w-4 h-4" /> Add Point
  </Button>
</div>
```

---

## 11. Resume Styling

### 11.1 CSS Architecture

The resume system uses **CSS Modules** and **Tokens** for styling.

- **Tokens** (`components/resume/styles/_tokens.css`): Defines semantic variables for colors.
- **Base Styles** (`components/resume/styles/_base.module.css`): Shared typography, spacing, and layout utilities.
- **Template Styles** (`components/resume/styles/[id].module.css`): Specific layout rules for each template.

### 11.2 Design Tokens

```css
/* _tokens.css */
.resume-body {
  /* Text colors */
  --resume-text-primary: #000000;
  --resume-text-secondary: #374151;
  
  /* Borders */
  --resume-border-primary: #9CA3AF;
  
  /* Backgrounds */
  --resume-accent-bg: #F3F4F6;
}
```

### 11.3 Base Styles

```css
/* _base.module.css */
.resume-body {
  --section-gap: 1.5rem;
  --item-gap: 0.5rem;
  --line-height: 1.5;
  --font-size-base: 14px;
  /* ... */
}

.resume-section-title {
  font-size: calc(var(--font-size-base) * 1.2);
  /* ... */
}
```

### 11.3 Contact Link Styling

```tsx
{/* Contact item with optional link */}
<span className="inline-flex items-center gap-1">
  {isLink ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="hover:underline text-black"
    >
      {displayText}
    </a>
  ) : (
    <span className="text-black">{displayText}</span>
  )}
</span>
```

---

## 12. Animation & Transitions

### 12.1 Standard Transitions

| Type | Classes | Duration |
|------|---------|----------|
| Color/opacity | `transition-colors` | 150ms |
| Transform | `transition-transform` | 150ms |
| All | `transition-all` | 200ms |

### 12.2 Loading Spinner

```tsx
<Loader2 className="w-4 h-4 animate-spin" />
```

### 12.3 Hover Effects

**Card hover (Dashboard):**
```tsx
'hover:-translate-y-1 hover:-translate-x-1 hover:shadow-[6px_6px_0px_0px_#000000]'
```

**Button hover (Press effect):**
```tsx
'hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none'
```

**Collapse toggle:**
```tsx
<ChevronDown className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
```

---

## 13. Responsive Breakpoints

| Breakpoint | Prefix | Min Width |
|------------|--------|-----------|
| Mobile | *(default)* | 0px |
| Small | `sm:` | 640px |
| Medium | `md:` | 768px |
| Large | `lg:` | 1024px |
| Extra Large | `xl:` | 1280px |

**Common Patterns:**

```tsx
// Grid columns
'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'

// Padding
'p-6 md:p-8'

// Layout direction
'flex-col lg:flex-row'

// Hide on mobile
'hidden md:block'
```

---

## 14. Extension Guide: Adding New Components

### 14.1 New Button Variant

```typescript
// In button.tsx variants object
newVariant: cn(
  'bg-purple-600 text-white',
  'border border-black',
  'shadow-[2px_2px_0px_0px_#000000]',
  'hover:bg-purple-700',
  'hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none',
  'active:translate-y-[2px] active:translate-x-[2px]'
),
```

### 14.2 New Status Card

```tsx
<div className="border border-black bg-white p-4 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.1)]">
  <div className="flex items-center gap-2 mb-2">
    <NewIcon className="w-4 h-4 text-gray-500" />
    <span className="font-mono text-xs uppercase text-gray-500">New Metric</span>
  </div>
  <span className="font-mono text-2xl font-bold">
    {value}
  </span>
</div>
```

### 14.3 New Dialog Variant

```typescript
// In confirm-dialog.tsx getVariantStyles
case 'info':
  return {
    iconBg: 'bg-purple-100 border-purple-300',
    iconColor: 'text-purple-700',
    buttonVariant: 'default' as const,
    defaultIcon: <Info className="w-6 h-6" />,
  };
```

---

## 15. Accessibility Guidelines

### 15.1 Focus States

All interactive elements include:
```tsx
'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2'
```

### 15.2 Color Contrast

| Background | Text | Contrast Ratio |
|------------|------|----------------|
| white | black | 21:1 |
| blue-700 | white | 7.8:1 |
| red-600 | white | 4.5:1 |
| green-700 | white | 4.5:1 |

### 15.3 Screen Reader Considerations

- Use semantic HTML (`<button>`, `<h1>-<h6>`, `<nav>`)
- Include `aria-label` for icon-only buttons
- Use `sr-only` class for visually hidden text
- Dialogs include proper `DialogTitle` and `DialogDescription`

---

*This document is part of the Resume Matcher technical documentation. See also: frontend-architecture.md, backend-architecture.md*
