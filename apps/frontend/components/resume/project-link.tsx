import React from 'react';
import { ExternalLink, Github } from 'lucide-react';
import baseStyles from './styles/_base.module.css';

const bare = (url: string) =>
  url
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');

/** "github.com/a/b" → "github.com": the host, for the linked-text style. */
const host = (url: string) => bare(url).split('/')[0];

/**
 * A project's GitHub or website link. It carries all three print styles, and
 * the resume root's `data-link-style` (chip, url, text) shows one of them in
 * _base.module.css: the hidden ones are display: none, so they stay out of the
 * PDF's text layer. The href is the same in every style.
 */
export const ProjectLink: React.FC<{ kind: 'github' | 'website'; url: string }> = ({
  kind,
  url,
}) => (
  <a
    href={url.startsWith('http') ? url : `https://${url}`}
    target="_blank"
    rel="noopener noreferrer"
    className={baseStyles['resume-link-pill']}
  >
    <span className={baseStyles['resume-link-icon']} aria-hidden="true">
      {kind === 'github' ? <Github size={10} /> : <ExternalLink size={10} />}
    </span>
    <span className={baseStyles['resume-link-url']}>{bare(url)}</span>
    <span className={baseStyles['resume-link-label']}>
      {kind === 'github' ? 'GitHub' : host(url)}
    </span>
  </a>
);
