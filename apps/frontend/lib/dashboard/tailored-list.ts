import type { ResumeListItem } from '@/lib/api/resume';

export type TailoredSort = 'recent' | 'name';

/**
 * The tailored resumes the dashboard shows: those of one master (or all), most
 * recently edited first, or A to Z by title in the UI locale.
 */
export function visibleTailored(
  resumes: readonly ResumeListItem[],
  {
    master,
    sort,
    titleOf,
    locale,
  }: {
    /** A master's resume id, or 'all'. */
    master: string;
    sort: TailoredSort;
    titleOf: (resume: ResumeListItem) => string;
    locale: string;
  }
): ResumeListItem[] {
  const edited = (resume: ResumeListItem) => Date.parse(resume.updated_at || resume.created_at);
  return resumes
    .filter((resume) => master === 'all' || resume.parent_id === master)
    .sort((a, b) =>
      sort === 'name' ? titleOf(a).localeCompare(titleOf(b), locale) : edited(b) - edited(a)
    );
}
