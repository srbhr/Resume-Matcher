'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { ResumePhotoSettings } from '@/components/dashboard/resume-component';
import { getResumePhotoUrl } from '@/lib/api/resume';
import styles from './styles/resume-profile-photo.module.css';

interface ResumeProfilePhotoProps {
  resumeId: string;
  name: string;
  photo: ResumePhotoSettings;
  editable?: boolean;
  editLabel: string;
  profilePhotoLabel: string;
  onEditPhoto?: () => void;
  onLoadError: () => void;
}

export function getPhotoDisplayDimensions(
  size: number,
  aspectRatio: number
): { width: number; height: number } {
  const ratio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
  if (ratio >= 1) {
    return { width: size, height: size / ratio };
  }
  return { width: size * ratio, height: size };
}

function ResumeProfilePhoto({
  resumeId,
  name,
  photo,
  editable = false,
  editLabel,
  profilePhotoLabel,
  onEditPhoto,
  onLoadError,
}: ResumeProfilePhotoProps) {
  const dimensions = getPhotoDisplayDimensions(photo.size, photo.aspectRatio);
  return (
    <div className={`resume-profile-photo ${styles.photo}`} style={dimensions}>
      {/* Browser-native img loading is required so Playwright can await decode(). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={getResumePhotoUrl(resumeId, photo.version)}
        alt={`${name} ${profilePhotoLabel}`.trim()}
        className={styles.image}
        onError={onLoadError}
      />
      {editable && onEditPhoto && (
        <button
          type="button"
          className={`${styles.editHitTarget} print:hidden`}
          onClick={onEditPhoto}
          aria-label={editLabel}
        />
      )}
    </div>
  );
}

interface ResumePhotoLayoutProps {
  children: ReactNode;
  resumeId?: string;
  name?: string;
  photo?: ResumePhotoSettings;
  editable?: boolean;
  editLabel?: string;
  profilePhotoLabel?: string;
  onEditPhoto?: () => void;
}

export function ResumePhotoLayout({
  children,
  resumeId,
  name = '',
  photo,
  editable,
  editLabel = 'Edit photo',
  profilePhotoLabel = 'profile photo',
  onEditPhoto,
}: ResumePhotoLayoutProps) {
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    setLoadFailed(false);
  }, [resumeId, photo?.version]);

  if (!resumeId || !photo || loadFailed) {
    return <>{children}</>;
  }

  return (
    <div data-photo-overlay="true" className={styles.wrapper}>
      {children}
      <ResumeProfilePhoto
        resumeId={resumeId}
        name={name}
        photo={photo}
        editable={editable}
        editLabel={editLabel}
        profilePhotoLabel={profilePhotoLabel}
        onEditPhoto={onEditPhoto}
        onLoadError={() => setLoadFailed(true)}
      />
    </div>
  );
}

export { ResumeProfilePhoto };
