/**
 * Where the community and support links point. Plain links only: nothing here is fetched at
 * runtime (no star counts, no avatars), so the app stays local-first.
 */
export const COMMUNITY_LINKS = {
  follow: 'https://github.com/srbhr',
  star: 'https://github.com/srbhr/Resume-Matcher',
  sponsor: 'https://github.com/sponsors/srbhr',
  contributors: 'https://github.com/srbhr/Resume-Matcher/graphs/contributors',
  discord: 'https://dsc.gg/resume-matcher',
} as const;

export type CommunityLinkId = keyof typeof COMMUNITY_LINKS;
