# Frontend Enhancement Decisions

This document captures architectural decisions made during the AI-powered Resume Enrichment feature implementation.

## Architecture Decisions

### Radix UI: Not Adopted

**Decision**: Do not add Radix UI to the project.

**Reasoning**:
1. **Existing Dialog Component**: The codebase already has a robust `Dialog` component (`components/ui/dialog.tsx`) that uses the native HTML `<dialog>` element with all needed features:
   - `showModal()` for proper modal behavior
   - Backdrop blur and animations
   - Body scroll locking
   - Keyboard accessibility (ESC to close)
   - Click-outside-to-close

2. **Dependency Bloat**: Adding Radix UI would introduce 10+ new dependencies for functionality that already exists.

3. **Design Requirements**: The Swiss Brutalist design (2px black borders, hard shadows, monospace fonts) requires custom styling regardless of which component library is used.

4. **Consistency**: The existing UI components follow established patterns that work well with the design system.

**Alternative Implemented**: Extended the existing `Dialog` pattern for the full-screen enrichment modal with custom sizing (80% viewport) and animations.

---

### State Management: React Context + useReducer

**Decision**: Use React's built-in `useReducer` hook for wizard state management instead of external state libraries (Redux, Zustand, etc.).

**Reasoning**:
1. **Self-Contained State**: The enrichment wizard state is isolated and doesn't need to be shared across the application.

2. **Complex Transitions**: `useReducer` handles the wizard's step-based state transitions cleanly:
   ```typescript
   type WizardStep =
     | 'idle'
     | 'analyzing'
     | 'questions'
     | 'generating'
     | 'preview'
     | 'applying'
     | 'complete'
     | 'error'
     | 'no-improvements';
   ```

3. **Established Pattern**: The codebase already uses Context + useState/useCallback for state management (see `status-cache.tsx`, `language-provider.tsx`).

4. **Bundle Size**: No additional dependencies needed.

5. **No Dev Tools Required**: The wizard flow doesn't need time-travel debugging or middleware.

**Implementation**: Created `hooks/use-enrichment-wizard.ts` with a complete reducer pattern:
- State includes: step, items, questions, answers, preview, error
- Actions for: analysis, answering, navigation, generation, application
- Derived state helpers: currentQuestion, isLastQuestion, answeredCount

---

## Component Architecture

### File Structure

```
components/enrichment/
├── enrichment-modal.tsx     # Main modal container, orchestrates steps
├── loading-steps.tsx        # AnalyzingStep, GeneratingStep, CompleteStep, ErrorStep
├── question-step.tsx        # Typeform-style question UI
└── preview-step.tsx         # Enhancement diff view
```

### Key Patterns Used

1. **Compound Component Pattern**: The modal contains multiple step components rendered based on wizard state.

2. **Custom Hook for Business Logic**: `useEnrichmentWizard` encapsulates all state management and API calls.

3. **Controlled Dialog**: The modal receives `isOpen`/`onClose` props from parent for external control.

---

## Styling Approach

### Swiss Brutalist Design System

```css
/* Modal container */
.enrichment-modal {
  width: calc(100vw - 80px);   /* 40px padding each side */
  height: calc(100vh - 80px);
  max-width: 1200px;
  background: white;
  border: 2px solid black;
  box-shadow: 8px 8px 0px 0px rgba(0,0,0,0.9);
}

/* Backdrop */
.enrichment-backdrop {
  backdrop-filter: blur(4px);
  background: rgba(0,0,0,0.3);
}
```

### Typography

- Headers: `font-mono font-bold uppercase tracking-wider`
- Body: Standard sans-serif
- Code/Technical: `font-mono`

---

## API Integration

### Backend Endpoints

```
POST /api/v1/enrichment/analyze/{resume_id}
  → AnalysisResponse { items_to_enrich, questions, analysis_summary }

POST /api/v1/enrichment/enhance
  → EnhancementPreview { enhancements }

POST /api/v1/enrichment/apply/{resume_id}
  → { message, updated_items }
```

### Frontend API Functions

Located in `lib/api/enrichment.ts`:
- `analyzeResume(resumeId)` - Triggers AI analysis
- `generateEnhancements(resumeId, answers)` - Creates enhanced descriptions
- `applyEnhancements(resumeId, enhancements)` - Saves to database

---

## Error Handling Strategy

1. **Analysis Fails**: Show retry button, preserve nothing (fresh start)
2. **No Items to Improve**: Special "no-improvements" step with positive messaging
3. **Generation Fails**: Retry preserves answers, user doesn't have to re-answer
4. **Apply Fails**: Retry preserves preview, user can try again

---

## Future Considerations

### If External State Management Becomes Needed

Consider Zustand if:
- Multiple components outside the wizard need to observe enrichment state
- Persistent state across page navigations is required
- Complex middleware (logging, persistence) becomes necessary

### If More Complex UI Components Are Needed

Consider headless UI libraries (Radix, React Aria) if:
- Accessible select/combobox components are needed
- Complex dropdown menus with nested items are required
- Tooltip/popover positioning becomes complex

For now, the native HTML elements and custom components serve the design system well.

---

## Recent Updates

### Question Limit (Max 6 Questions)

**Change**: Limited the total number of questions to 6 maximum across all items.

**Reasoning**:
- Users reported feeling overwhelmed by too many questions
- Previously, the system could generate 3-4 questions per item, resulting in 10+ questions
- Now questions are prioritized by impact, limiting to 6 total

**Implementation**:
- Updated `ANALYZE_RESUME_PROMPT` in `apps/backend/app/prompts/enrichment.py`
- Added "MAXIMUM 6 QUESTIONS TOTAL" as a hard limit in prompt instructions

### Additive Enhancement (Add, Don't Replace)

**Change**: Enhanced bullet points are now **added** to existing content instead of replacing it.

**Reasoning**:
- Users wanted to increase content count, not just improve existing content
- Original bullet points often contain valuable information that shouldn't be lost
- Additive approach results in richer, more comprehensive resumes

**Implementation**:
1. Updated `ENHANCE_DESCRIPTION_PROMPT` to generate `additional_bullets` (new key)
2. Modified `apply_enhancements()` to concatenate instead of replace:
   ```python
   # Before: description = new_description (replacement)
   # After:  description = existing_desc + additional_bullets (concatenation)
   ```
3. Updated Preview UI to show "Keeping" + "Adding" sections instead of strikethrough replacement

### Preview UI Changes

**Before**:
- Original bullets shown with strikethrough
- Enhanced bullets shown as replacement
- Button: "Apply All Changes"

**After**:
- Original bullets shown normally under "Keeping" section
- New bullets shown under "Adding" section with green highlight
- Button: "Add to Resume"

**Key Files Changed**:
| File | Changes |
|------|---------|
| `apps/backend/app/prompts/enrichment.py` | 6 question limit, additive prompt |
| `apps/backend/app/routers/enrichment.py` | Concatenate instead of replace |
| `apps/frontend/components/enrichment/preview-step.tsx` | New "Keeping + Adding" UI |
