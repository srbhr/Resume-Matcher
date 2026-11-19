import type { RegenerateItemInput } from '@/lib/api/enrichment';
import type { ResumeData } from '@/components/dashboard/resume-component';

/**
 * The items the AI regenerate wizard offers, built from the canonical resume so
 * the backend's apply check matches the saved snapshot. The `exp_N` / `proj_N` /
 * `skills` ids are how the backend finds each item again: keep them stable.
 */
export function experienceRegenerateItems(
  workExperience: ResumeData['workExperience'] | undefined
): RegenerateItemInput[] {
  return (workExperience || []).map((exp, idx) => ({
    item_id: `exp_${idx}`,
    item_type: 'experience' as const,
    title: exp.title ?? '',
    subtitle: exp.company || undefined,
    current_content: Array.isArray(exp.description) ? exp.description : [],
  }));
}

export function projectRegenerateItems(
  personalProjects: ResumeData['personalProjects'] | undefined
): RegenerateItemInput[] {
  return (personalProjects || []).map((proj, idx) => ({
    item_id: `proj_${idx}`,
    item_type: 'project' as const,
    title: proj.name ?? '',
    subtitle: proj.role || undefined,
    current_content: Array.isArray(proj.description) ? proj.description : [],
  }));
}

/** The skills item, or null when the resume lists no technical skills. */
export function skillsRegenerateItem(
  technicalSkills: string[] | undefined,
  title: string
): RegenerateItemInput | null {
  if (technicalSkills && technicalSkills.length > 0) {
    return {
      item_id: 'skills',
      item_type: 'skills' as const,
      title,
      current_content: technicalSkills,
    };
  }
  return null;
}
