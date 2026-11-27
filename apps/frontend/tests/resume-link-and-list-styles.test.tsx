import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Resume, { type ResumeData } from '@/components/dashboard/resume-component';
import { ProjectLink } from '@/components/resume/project-link';
import { TagList } from '@/components/resume/tag-list';
import { DEFAULT_TEMPLATE_SETTINGS } from '@/lib/types/template-settings';

/**
 * Project links print as a chip, the full address or linked text, and each list
 * row as pills or commas. The choice sits on the resume root as data attributes
 * and _base.module.css applies it, so the markup carries every variant.
 */
const css = readFileSync(
  path.join(__dirname, '..', 'components', 'resume', 'styles', '_base.module.css'),
  'utf8'
);

describe('ProjectLink', () => {
  it('links the same address in every style, carrying the address and a short label', () => {
    render(<ProjectLink kind="github" url="github.com/ada/promptdiff/" />);
    const link = screen.getByRole('link');

    expect(link).toHaveAttribute('href', 'https://github.com/ada/promptdiff/');
    expect(link).toHaveTextContent('github.com/ada/promptdiff');
    expect(link).toHaveTextContent('GitHub');
  });

  it('keeps an address whose scheme is in capitals, instead of adding a second one', () => {
    render(<ProjectLink kind="website" url="HTTPS://WWW.Example.com/Work" />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'HTTPS://WWW.Example.com/Work');
    expect(link).toHaveTextContent('Example.com/Work');
    expect(link).not.toHaveTextContent('HTTPS://');
  });

  it('labels a website by its host name', () => {
    render(<ProjectLink kind="website" url="https://www.project-demo.com/docs" />);
    expect(screen.getByRole('link')).toHaveTextContent('project-demo.com');
  });

  it('is styled per data-link-style: url and text drop the box, text hides the address', () => {
    expect(css).toMatch(/\[data-link-style='url'\] \.resume-link-pill/);
    expect(css).toMatch(/\[data-link-style='text'\] \.resume-link-url \{\s*display: none;/);
    expect(css).toMatch(/\[data-link-style='text'\] \.resume-link-label \{\s*display: inline;/);
  });
});

describe('TagList rows', () => {
  it('names its row, keeping the commas in the text for every style', () => {
    const { container } = render(<TagList items={['Python', 'Go']} row="skills" />);
    const list = container.firstChild as HTMLElement;

    expect(list).toHaveAttribute('data-list-row', 'skills');
    expect(list).toHaveTextContent('Python, Go');
  });

  it('sets tight pills 0.25rem apart, each holding the separator after it', () => {
    const { container } = render(<TagList items={['Python', 'Go', 'SQL']} row="skills" tight />);
    const list = container.firstChild as HTMLElement;

    expect(list).toHaveAttribute('data-tight');
    // The same text, so the PDF text layer still reads "Python, Go, SQL".
    expect(list).toHaveTextContent('Python, Go, SQL');
    const items = [...list.children];
    expect(items).toHaveLength(3);
    // A pill and the comma after it are one unbreakable item; the last has none.
    expect(items.map((item) => item.textContent)).toEqual(['Python, ', 'Go, ', 'SQL']);
    expect(css).toMatch(/\.resume-tag-item \{\s*white-space: nowrap;/);
    expect(css).toMatch(
      /\.resume-tag-list\[data-tight\] \.resume-tag-separator \{\s*display: inline-block;\s*width: 0\.25rem;/
    );
  });

  it('keeps the space-wide gap for a list that is not tight', () => {
    const { container } = render(<TagList items={['Python', 'Go']} row="skills" />);
    expect(container.firstChild).not.toHaveAttribute('data-tight');
  });

  it('has a comma rule for every row', () => {
    for (const row of ['skills', 'languages', 'certifications', 'awards']) {
      expect(css).toContain(
        `[data-list-${row}='comma'] [data-list-row='${row}'] .resume-skill-pill`
      );
    }
  });
});

describe('the resume root', () => {
  const data = { personalInfo: { name: 'Ada' } } as ResumeData;

  it('carries the link style and each row style for the stylesheet', () => {
    const { container } = render(
      <Resume
        resumeData={data}
        settings={{
          ...DEFAULT_TEMPLATE_SETTINGS,
          linkStyle: 'text',
          listStyle: { ...DEFAULT_TEMPLATE_SETTINGS.listStyle, awards: 'comma' },
        }}
      />
    );
    const root = container.querySelector('[data-link-style]') as HTMLElement;

    expect(root).toHaveAttribute('data-link-style', 'text');
    expect(root).toHaveAttribute('data-list-awards', 'comma');
    expect(root).toHaveAttribute('data-list-skills', 'pills');
  });

  it('prints settings saved before these options with chips and pills', () => {
    const { linkStyle: _l, listStyle: _s, ...older } = DEFAULT_TEMPLATE_SETTINGS;
    const { container } = render(
      <Resume resumeData={data} settings={older as typeof DEFAULT_TEMPLATE_SETTINGS} />
    );
    const root = container.querySelector('[data-link-style]') as HTMLElement;

    expect(root).toHaveAttribute('data-link-style', 'chip');
    expect(root).toHaveAttribute('data-list-languages', 'pills');
  });
});
