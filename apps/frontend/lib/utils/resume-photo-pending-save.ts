interface PendingSaveResponse<TResume> {
  processed_resume?: TResume | null;
}

interface SavePendingResumeBeforePhotoOptions<TResume, TPhotoResponse> {
  pendingResume: TResume | null;
  savePendingResume: () => Promise<PendingSaveResponse<TResume>>;
  onSaved: (resume: TResume) => void;
  photoOperation: () => Promise<TPhotoResponse>;
}

export async function savePendingResumeBeforePhoto<TResume, TPhotoResponse>({
  pendingResume,
  savePendingResume,
  onSaved,
  photoOperation,
}: SavePendingResumeBeforePhotoOptions<TResume, TPhotoResponse>): Promise<TPhotoResponse> {
  if (pendingResume) {
    const updated = await savePendingResume();
    onSaved(updated.processed_resume ?? pendingResume);
  }

  return photoOperation();
}
