# Frontend Issues

> **Component:** `apps/frontend/`
> **Issues Found:** 10
> **Critical:** 2 | **High:** 2 | **Medium:** 6

---

## Table of Contents

1. [FE-001: Inconsistent Error States After API Failure](#fe-001-inconsistent-error-states-after-api-failure)
2. [FE-002: Silent Cover Letter Save Failures](#fe-002-silent-cover-letter-save-failures)
3. [FE-003: Download Error Details Lost](#fe-003-download-error-details-lost)
4. [FE-004: Race Condition on Rapid Saves](#fe-004-race-condition-on-rapid-saves)
5. [FE-005: Upload Success Callback Timing](#fe-005-upload-success-callback-timing)
6. [FE-006: No API Response Validation](#fe-006-no-api-response-validation)
7. [FE-007: Enrichment Modal Direct Apply](#fe-007-enrichment-modal-direct-apply)
8. [FE-008: Missing Idempotency on Confirm](#fe-008-missing-idempotency-on-confirm)
9. [FE-009: Save Button Double-Click Window](#fe-009-save-button-double-click-window)
10. [FE-010: Stale LocalStorage Recovery](#fe-010-stale-localstorage-recovery)

---

## FE-001: Inconsistent Error States After API Failure

**Severity:** CRITICAL
**Location:** `apps/frontend/components/builder/resume-builder.tsx:401-420`

### Description

When save operation fails, UI state becomes inconsistent. The `resumeData` and `lastSavedData` remain mismatched.

### Current Code

```typescript
const handleSave = async () => {
  try {
    setIsSaving(true);
    const updated = await updateResume(resumeId, resumeData);
    const nextData = (updated.processed_resume || resumeData) as ResumeData;
    setResumeData(nextData);        // Only set on SUCCESS
    setLastSavedData(nextData);     // Only set on SUCCESS
    setHasUnsavedChanges(false);    // Only set on SUCCESS
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextData)); // Only on SUCCESS
  } catch (error) {
    console.error('Failed to save resume:', error);
    showNotification(t('builder.alerts.saveFailed'), 'danger');
    // hasUnsavedChanges stays TRUE but state is inconsistent
  } finally {
    setIsSaving(false);  // Button becomes re-clickable
  }
};
```

### Impact

User sees error notification, button becomes clickable again, BUT if they click Save multiple times rapidly after a failure:
- Save attempt 1 fails (data unchanged)
- User clicks Save again (attempt 2)
- If attempt 2 succeeds, it saves potentially stale data
- Data loss potential on rapid retry

### Proposed Fix

```typescript
const handleSave = async () => {
  // Capture current state at time of save
  const dataToSave = { ...resumeData };
  const saveTimestamp = Date.now();

  try {
    setIsSaving(true);
    setSaveAttemptTimestamp(saveTimestamp);

    const updated = await updateResume(resumeId, dataToSave);

    // Only update if this is still the latest save attempt
    if (saveAttemptTimestamp === saveTimestamp) {
      const nextData = (updated.processed_resume || dataToSave) as ResumeData;
      setResumeData(nextData);
      setLastSavedData(nextData);
      setHasUnsavedChanges(false);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextData));
      showNotification(t('builder.alerts.saveSuccess'), 'success');
    }
  } catch (error) {
    console.error('Failed to save resume:', error);
    showNotification(t('builder.alerts.saveFailed'), 'danger');

    // Store failed state for retry logic
    setLastSaveError({
      timestamp: saveTimestamp,
      data: dataToSave,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  } finally {
    setIsSaving(false);
  }
};
```

---

## FE-002: Silent Cover Letter Save Failures

**Severity:** CRITICAL
**Location:** `apps/frontend/components/builder/resume-builder.tsx:454-465`

### Description

Cover letter and outreach message saves have no success feedback - user has no indication if save succeeded.

### Current Code

```typescript
const handleSaveCoverLetter = async () => {
  if (!resumeId) return;
  try {
    setIsCoverLetterSaving(true);
    await updateCoverLetter(resumeId, coverLetter);
    // NO SUCCESS STATE UPDATES!
  } catch (error) {
    console.error('Failed to save cover letter:', error);
    showNotification(t('builder.alerts.coverLetterSaveFailed'), 'danger');
  } finally {
    setIsCoverLetterSaving(false);
  }
};
```

### Impact

- No success notification shown to user
- No state reset to mark as "saved"
- No localStorage sync
- Save button loading state disappears with no indication of outcome
- File could silently fail to save, user discovers later when data is lost

### Proposed Fix

```typescript
const handleSaveCoverLetter = async () => {
  if (!resumeId) return;

  try {
    setIsCoverLetterSaving(true);
    await updateCoverLetter(resumeId, coverLetter);

    // Success feedback
    setLastSavedCoverLetter(coverLetter);
    setHasUnsavedCoverLetterChanges(false);
    showNotification(t('builder.alerts.coverLetterSaveSuccess'), 'success');

    // Sync to localStorage for recovery
    localStorage.setItem(
      `${STORAGE_KEY}_cover_letter`,
      JSON.stringify({ content: coverLetter, savedAt: Date.now() })
    );
  } catch (error) {
    console.error('Failed to save cover letter:', error);
    showNotification(t('builder.alerts.coverLetterSaveFailed'), 'danger');
  } finally {
    setIsCoverLetterSaving(false);
  }
};
```

---

## FE-003: Download Error Details Lost

**Severity:** MEDIUM
**Location:** `apps/frontend/components/builder/resume-builder.tsx:428-451`

### Description

When PDF download fails, server error details are not shown to user.

### Current Code

```typescript
const handleDownload = async () => {
  try {
    setIsDownloading(true);
    const blob = await downloadResumePdf(resumeId, templateSettings, uiLanguage);
    downloadBlobAsFile(blob, `resume_${resumeId}.pdf`);
  } catch (error) {
    console.error('Failed to download resume:', error);
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      // Network error fallback
      const fallbackUrl = getResumePdfUrl(resumeId, templateSettings, uiLanguage);
      const didOpen = openUrlInNewTab(fallbackUrl);
      if (!didOpen) {
        showNotification(t('common.popupBlocked', { url: fallbackUrl }), 'warning');
      }
      return;
    }
    showNotification(t('builder.alerts.downloadFailed'), 'danger');
  } finally {
    setIsDownloading(false);
  }
};
```

### Impact

- If backend returns HTTP 500 with error message, user only sees "Download Failed"
- No troubleshooting information available
- Server may have returned useful error details that are discarded

### Proposed Fix

```typescript
const handleDownload = async () => {
  try {
    setIsDownloading(true);
    const blob = await downloadResumePdf(resumeId, templateSettings, uiLanguage);
    downloadBlobAsFile(blob, `resume_${resumeId}.pdf`);
    showNotification(t('builder.alerts.downloadSuccess'), 'success');
  } catch (error) {
    console.error('Failed to download resume:', error);

    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      // Network error - try fallback
      const fallbackUrl = getResumePdfUrl(resumeId, templateSettings, uiLanguage);
      const didOpen = openUrlInNewTab(fallbackUrl);
      if (!didOpen) {
        showNotification(t('common.popupBlocked', { url: fallbackUrl }), 'warning');
      }
      return;
    }

    // Extract server error message if available
    let errorMessage = t('builder.alerts.downloadFailed');
    if (error instanceof Error) {
      // Parse error message from API response
      const serverError = error.message.match(/status \d+\): (.+)/);
      if (serverError) {
        errorMessage = `${t('builder.alerts.downloadFailed')}: ${serverError[1]}`;
      }
    }

    showNotification(errorMessage, 'danger');
  } finally {
    setIsDownloading(false);
  }
};
```

---

## FE-004: Race Condition on Rapid Saves

**Severity:** HIGH
**Location:** `apps/frontend/components/builder/resume-builder.tsx:391-395`

### Description

When user makes rapid edits during a save operation, localStorage and API state can diverge.

### Current Code

```typescript
const handleUpdate = useCallback((newData: ResumeData) => {
  setResumeData(newData);
  setHasUnsavedChanges(true);
  // Auto-save draft to localStorage
  localStorage.setItem(STORAGE_KEY, JSON.stringify(newData));
}, []);
```

Combined with save button that only disables during `isSaving`:

```typescript
<Button size="sm" onClick={handleSave} disabled={!resumeId || isSaving}>
```

### Impact

1. User makes edit A → `setResumeData(A)` → localStorage saves A
2. User makes edit B → `setResumeData(B)` → localStorage saves B
3. User clicks Save while state is B
4. Meanwhile, edits C, D, E come in (state updates)
5. Save of B is in flight, localStorage now has E
6. If Save of B fails and is retried, it saves B (old data), not E

**Root Cause:** No optimistic locking. localStorage is updated for every keystroke, but API save might complete with stale data.

### Proposed Fix

```typescript
// Use a version counter for optimistic locking
const [dataVersion, setDataVersion] = useState(0);
const savingVersionRef = useRef<number | null>(null);

const handleUpdate = useCallback((newData: ResumeData) => {
  setResumeData(newData);
  setDataVersion((v) => v + 1);
  setHasUnsavedChanges(true);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    data: newData,
    version: dataVersion + 1,
    timestamp: Date.now(),
  }));
}, [dataVersion]);

const handleSave = async () => {
  const versionToSave = dataVersion;
  const dataToSave = resumeData;

  // Don't save if already saving this or newer version
  if (savingVersionRef.current !== null && savingVersionRef.current >= versionToSave) {
    return;
  }

  try {
    setIsSaving(true);
    savingVersionRef.current = versionToSave;

    const updated = await updateResume(resumeId, dataToSave);

    // Only update state if no newer edits happened during save
    if (dataVersion === versionToSave) {
      const nextData = (updated.processed_resume || dataToSave) as ResumeData;
      setResumeData(nextData);
      setLastSavedData(nextData);
      setHasUnsavedChanges(false);
    } else {
      // Newer edits exist - keep unsaved changes flag
      console.log('Save completed but newer edits exist');
    }
  } catch (error) {
    console.error('Failed to save resume:', error);
    showNotification(t('builder.alerts.saveFailed'), 'danger');
  } finally {
    setIsSaving(false);
    savingVersionRef.current = null;
  }
};
```

---

## FE-005: Upload Success Callback Timing

**Severity:** MEDIUM
**Location:** `apps/frontend/components/dashboard/resume-upload-dialog.tsx:63-86`

### Description

Parent component receives resumeId before dialog visually closes, causing potential timing issues.

### Current Code

```typescript
onUploadSuccess: (uploadedFile, response) => {
  const data = response as { resume_id?: string };
  if (data.resume_id) {
    setUploadFeedback({
      type: 'success',
      message: t('dashboard.uploadDialog.success'),
    });
    const resumeId = data.resume_id;
    setTimeout(() => {
      onUploadComplete?.(resumeId);  // Parent called immediately
    }, 0);
    setTimeout(() => {
      setIsOpen(false);  // Dialog closes 1.5s later
      setUploadFeedback(null);
      removeFile(uploadedFile.id);
    }, 1500);
  } else {
    setUploadFeedback({
      type: 'error',
      message: t('dashboard.uploadDialog.successMissingId'),
    });
  }
},
```

### Impact

1. `onUploadComplete?.(resumeId)` is called via `setTimeout(..., 0)`, before the dialog closes
2. Parent component receives resumeId and calls `setMasterResumeId(resumeId)`
3. Dialog is still open showing success message
4. If parent re-renders and re-mounts components, timing could be off

### Proposed Fix

```typescript
onUploadSuccess: (uploadedFile, response) => {
  const data = response as { resume_id?: string };
  if (data.resume_id) {
    setUploadFeedback({
      type: 'success',
      message: t('dashboard.uploadDialog.success'),
    });

    const resumeId = data.resume_id;

    // Close dialog first, then notify parent
    setTimeout(() => {
      setIsOpen(false);
      setUploadFeedback(null);
      removeFile(uploadedFile.id);

      // Notify parent after dialog is fully closed
      requestAnimationFrame(() => {
        onUploadComplete?.(resumeId);
      });
    }, 1500);
  } else {
    setUploadFeedback({
      type: 'error',
      message: t('dashboard.uploadDialog.successMissingId'),
    });
  }
},
```

---

## FE-006: No API Response Validation

**Severity:** MEDIUM
**Location:** Multiple files in `apps/frontend/lib/api/`

### Description

When resumeData is fetched from API, it's trusted without validation.

### Current Code

```typescript
if (data.processed_resume) {
  setResumeData(data.processed_resume as ResumeData);
  // Just trust it's valid, no validation
}
```

### Impact

If backend returns corrupted/incomplete data:
- Missing `personalInfo` object
- Empty arrays
- Null values where objects expected

The frontend will:
1. Set invalid state
2. Pass to components that expect proper structure
3. Components might crash or render nothing
4. No error shown to user

### Proposed Fix

```typescript
import { z } from 'zod';

// Define schema matching backend
const ResumeDataSchema = z.object({
  personalInfo: z.object({
    name: z.string(),
    email: z.string().optional(),
    phone: z.string().optional(),
    location: z.string().optional(),
    linkedin: z.string().optional(),
    website: z.string().optional(),
  }),
  summary: z.string().optional(),
  workExperience: z.array(z.object({
    company: z.string(),
    position: z.string(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    description: z.array(z.string()).default([]),
  })).default([]),
  education: z.array(z.any()).default([]),
  // ... etc
});

// Validate before setting state
if (data.processed_resume) {
  const parseResult = ResumeDataSchema.safeParse(data.processed_resume);
  if (parseResult.success) {
    setResumeData(parseResult.data as ResumeData);
  } else {
    console.error('Invalid resume data from API:', parseResult.error);
    showNotification(
      'Received invalid resume data. Some sections may be missing.',
      'warning'
    );
    // Set with defaults for missing fields
    setResumeData(applyDefaults(data.processed_resume));
  }
}
```

---

## FE-007: Enrichment Modal Direct Apply

**Severity:** MEDIUM
**Location:** `apps/frontend/components/enrichment/enrichment-modal.tsx:175`

### Description

Enrichment changes are applied directly without final confirmation.

### Current Code

```typescript
case 'preview':
  return (
    <PreviewStep
      enhancements={state.preview}
      onApply={applyChanges}  // Direct apply, no confirmation
      onCancel={handleClose}
    />
  );
```

### Impact

- No "Are you sure?" confirmation before applying changes
- If user accidentally clicks Apply while reviewing, changes are committed immediately
- Modal prevents closing during "applying" state, user is stuck watching
- No undo mechanism

### Proposed Fix

```typescript
case 'preview':
  return (
    <PreviewStep
      enhancements={state.preview}
      onApply={() => setShowApplyConfirmation(true)}
      onCancel={handleClose}
    />
  );

// Add confirmation dialog
{showApplyConfirmation && (
  <ConfirmationDialog
    title={t('enrichment.confirmApply.title')}
    message={t('enrichment.confirmApply.message')}
    confirmLabel={t('enrichment.confirmApply.confirm')}
    cancelLabel={t('common.cancel')}
    onConfirm={() => {
      setShowApplyConfirmation(false);
      applyChanges();
    }}
    onCancel={() => setShowApplyConfirmation(false)}
  />
)}
```

---

## FE-008: Missing Idempotency on Confirm

**Severity:** MEDIUM
**Location:** `apps/frontend/app/(default)/tailor/page.tsx:216-235`

### Description

The confirm operation has no idempotency key, allowing duplicate resumes on network issues.

### Current Code

```typescript
const handleConfirmChanges = async () => {
  if (!pendingResult) return;
  setIsLoading(true);
  setError(null);
  setDiffConfirmError(null);

  try {
    await confirmAndNavigate(pendingResult);  // No idempotency key
    setShowDiffModal(false);
    setPendingResult(null);
  } catch (err) {
    console.error(err);
    const errorMessage = t('tailor.errors.failedToConfirm');
    setError(errorMessage);
    setDiffConfirmError(errorMessage);
  } finally {
    setIsLoading(false);
  }
};
```

### Impact

If user's network is flaky:
1. User clicks Confirm
2. API call succeeds and creates resume
3. Network stalls on response
4. Client timeout/error
5. User clicks Confirm again
6. Second identical request creates ANOTHER resume

### Proposed Fix

```typescript
import { v4 as uuidv4 } from 'uuid';

// Generate idempotency key when preview is created
const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);

// When preview is generated:
const handlePreview = async () => {
  setIdempotencyKey(uuidv4());
  // ... generate preview
};

const handleConfirmChanges = async () => {
  if (!pendingResult || !idempotencyKey) return;

  // Disable button to prevent double-click
  if (isConfirming) return;
  setIsConfirming(true);

  try {
    await confirmAndNavigate(pendingResult, {
      idempotencyKey,  // Pass to API
    });
    setShowDiffModal(false);
    setPendingResult(null);
    setIdempotencyKey(null);  // Clear after success
  } catch (err) {
    // Check if error is "already confirmed"
    if (isAlreadyConfirmedError(err)) {
      // Navigate to the already-created resume
      const existingId = extractResumeIdFromError(err);
      if (existingId) {
        router.push(`/builder/${existingId}`);
        return;
      }
    }

    console.error(err);
    setDiffConfirmError(t('tailor.errors.failedToConfirm'));
  } finally {
    setIsConfirming(false);
  }
};
```

---

## FE-009: Save Button Double-Click Window

**Severity:** LOW
**Location:** `apps/frontend/components/builder/resume-builder.tsx:646`

### Description

Small window exists between user click and `setIsSaving(true)` where a second click could register.

### Current Code

```typescript
<Button size="sm" onClick={handleSave} disabled={!resumeId || isSaving}>
  <Save className="w-4 h-4" />
  {isSaving ? t('common.saving') : t('common.save')}
</Button>
```

### Impact

- React batches state updates, so this is generally safe
- However, the pattern would be stronger with additional protection
- AbortController could cancel in-flight requests on new save

### Proposed Fix

```typescript
const abortControllerRef = useRef<AbortController | null>(null);
const saveInProgressRef = useRef(false);

const handleSave = async () => {
  // Prevent concurrent saves
  if (saveInProgressRef.current) {
    console.log('Save already in progress');
    return;
  }

  // Cancel any previous in-flight request
  if (abortControllerRef.current) {
    abortControllerRef.current.abort();
  }

  const controller = new AbortController();
  abortControllerRef.current = controller;
  saveInProgressRef.current = true;

  try {
    setIsSaving(true);
    const updated = await updateResume(resumeId, resumeData, {
      signal: controller.signal,
    });
    // ... success handling
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      console.log('Save was aborted');
      return;
    }
    // ... error handling
  } finally {
    setIsSaving(false);
    saveInProgressRef.current = false;
  }
};
```

---

## FE-010: Stale LocalStorage Recovery

**Severity:** MEDIUM
**Location:** `apps/frontend/components/builder/resume-builder.tsx:338-351`

### Description

After browser crash, recovered draft may overwrite successfully saved data.

### Current Code

```typescript
// Priority 3: Restore from localStorage (browser refresh recovery)
const savedDraft = localStorage.getItem(STORAGE_KEY);
if (savedDraft) {
  try {
    const parsed = JSON.parse(savedDraft);
    setResumeData(parsed);
    setLastSavedData(parsed);
    setHasUnsavedChanges(true);  // Mark as unsaved
    setLoadingState('loaded');
    return;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}
```

### Impact

After browser crash:
1. User had unsaved changes in localStorage
2. User refreshes
3. Draft is restored
4. BUT if they had clicked "Save" before crash, the API call might have succeeded
5. Now they have stale draft loaded, thinking it's unsaved
6. If they click Save again, they overwrite the actual saved version with old draft

The app doesn't know if the draft saved successfully before crash.

### Proposed Fix

```typescript
// Store version info with draft
interface DraftState {
  data: ResumeData;
  version: number;
  savedAt: number | null;  // Timestamp of last successful save
  draftedAt: number;       // Timestamp of draft
}

// On recovery:
const savedDraft = localStorage.getItem(STORAGE_KEY);
if (savedDraft) {
  try {
    const draft: DraftState = JSON.parse(savedDraft);

    // Fetch current server state
    const serverResume = await fetchResume(resumeId);
    const serverUpdatedAt = new Date(serverResume.updated_at).getTime();

    // Compare timestamps
    if (draft.savedAt && serverUpdatedAt > draft.savedAt) {
      // Server has newer data - use server version
      console.log('Server has newer data than draft');
      setResumeData(serverResume.processed_data);
      setLastSavedData(serverResume.processed_data);
      setHasUnsavedChanges(false);
      localStorage.removeItem(STORAGE_KEY);
    } else if (draft.draftedAt > (draft.savedAt || 0)) {
      // Draft is newer - show recovery dialog
      setRecoveryState({
        draft: draft.data,
        server: serverResume.processed_data,
        draftedAt: draft.draftedAt,
        serverUpdatedAt,
      });
      setShowRecoveryDialog(true);
    } else {
      // Draft and server are in sync
      setResumeData(serverResume.processed_data);
      setHasUnsavedChanges(false);
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

// Recovery dialog lets user choose:
// - "Use my draft" - keeps localStorage version
// - "Use saved version" - uses server version
// - "Compare" - shows diff
```
