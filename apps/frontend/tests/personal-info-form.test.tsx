import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PersonalInfoForm } from '@/components/builder/forms/personal-info-form';

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));

describe('PersonalInfoForm autofill hints', () => {
  it('declares the input purpose of the user’s own contact fields (WCAG 1.3.5)', () => {
    const { container } = render(<PersonalInfoForm data={{}} onChange={vi.fn()} />);
    const field = (id: string) => container.querySelector<HTMLInputElement>(`#${id}`)!;

    expect(field('name')).toHaveAttribute('autocomplete', 'name');
    expect(field('title')).toHaveAttribute('autocomplete', 'organization-title');
    expect(field('email')).toHaveAttribute('autocomplete', 'email');
    expect(field('phone')).toHaveAttribute('autocomplete', 'tel');
    expect(field('website')).toHaveAttribute('autocomplete', 'url');
    expect(field('website')).toHaveAttribute('inputmode', 'url');
  });

  it('leaves the location and profile-link fields without a purpose hint', () => {
    const { container } = render(<PersonalInfoForm data={{}} onChange={vi.fn()} />);

    for (const id of ['location', 'linkedin', 'github']) {
      expect(container.querySelector(`#${id}`)).not.toHaveAttribute('autocomplete');
    }
  });
});
