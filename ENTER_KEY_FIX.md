# Enter Key Fix for Skills/Awards Sections ✅

## Problem

The Enter key was not working in the Skills, Languages, Certifications, and Awards textarea fields in the Resume Builder. Pressing Enter did not create a new line, especially when the cursor was at the end of a line or word.

## Root Cause

The dnd-kit library's `KeyboardSensor` was intercepting keyboard events globally for drag-and-drop functionality. This sensor was capturing the Enter key before it could reach the textarea elements, preventing the default newline behavior.

## Solution

**Removed the `KeyboardSensor` entirely** from the drag-and-drop configuration. Users can still reorder sections using mouse/touch gestures via the `PointerSensor`.

### Why This Works

The KeyboardSensor was causing global keyboard event interference that couldn't be reliably worked around. Since:
1. The drag handle is already clearly visible (grip icon)
2. Mouse/touch dragging works perfectly
3. Keyboard accessibility for dragging is less critical than text input functionality

We prioritized working textareas over keyboard-based section reordering.

### Code Changes

**File 1**: `/apps/frontend/components/builder/resume-form.tsx`

**Before:**
```typescript
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

// ...

const sensors = useSensors(
  useSensor(PointerSensor),
  useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  })
);
```

**After:**
```typescript
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

// ...

// KeyboardSensor removed to prevent interference with textarea Enter key
// Users can still drag sections using mouse/touch (PointerSensor)
const sensors = useSensors(
  useSensor(PointerSensor)
);
```

**File 2**: `/apps/frontend/components/builder/forms/additional-form.tsx`

- Removed all `onKeyDown` / `onKeyDownCapture` handlers
- Textareas now work with natural browser behavior

## Files Changed

1. **`apps/frontend/components/builder/resume-form.tsx`**
   - Removed `KeyboardSensor` import
   - Removed `sortableKeyboardCoordinates` import  
   - Removed `useSensor(KeyboardSensor, ...)` from sensors configuration
   - Added comment explaining why KeyboardSensor is disabled

2. **`apps/frontend/components/builder/forms/additional-form.tsx`**
   - Removed event handler functions
   - Removed `onKeyDown` / `onKeyDownCapture` props from textareas

## Testing

1. Open http://localhost:3000
2. Go to Resume Builder
3. Navigate to the Skills/Awards section (scroll down or expand "Additional Information")
4. Click in any textarea (Technical Skills, Languages, Certifications, or Awards)
5. Type some text and press Enter **anywhere** (middle of word, end of line, etc.)
6. **Expected**: A new line is created in the textarea ✅

### Drag-and-Drop Still Works

1. Hover over the left edge of any section (except Personal Info)
2. You'll see a grip icon (⋮⋮)
3. Click and drag to reorder sections ✅

## Trade-offs

### ✅ Benefits
- Enter key works perfectly in all textareas
- Simpler code (no complex event handling)
- No edge cases with cursor position
- Consistent behavior across all browsers

### ⚠️ Trade-offs  
- Keyboard-only users cannot reorder sections using keyboard shortcuts
- Drag-and-drop still works perfectly with mouse/touch
- This is acceptable because:
  - The primary use case is text input (resumes are text-heavy)
  - Mouse/touch interaction is standard for drag-and-drop UI
  - Most users expect to drag with a pointer device

## Alternative Solutions Considered

1. **`onKeyDownCapture` with `stopPropagation()`** - Blocked events from reaching textarea, causing partial failures
2. **Custom KeyboardSensor activation function** - dnd-kit doesn't provide sufficient API hooks
3. **Conditional event handlers** - Too complex and unreliable
4. **Disable KeyboardSensor** - ✅ **Chosen solution** - Simple, reliable, and pragmatic

---

**Status**: ✅ Fixed  
**Date**: January 16, 2026  
**Files Changed**: 2  
**Test**: Press Enter anywhere in Skills/Languages/Certifications/Awards textareas

