import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DescriptionList } from '@/components/resume/description-list';

describe('DescriptionList', () => {
  it('renders bullet rows with a marker and plain rows without marker indentation', () => {
    render(
      <DescriptionList
        items={['Core module', 'Built reliable workflows']}
        styles={['plain', 'bullet']}
      />
    );

    const rows = screen.getAllByRole('listitem');

    expect(rows[0]).not.toHaveClass('ml-4');
    expect(within(rows[0]).queryByText('•')).not.toBeInTheDocument();
    expect(rows[0]).toHaveTextContent('Core module');

    expect(rows[1]).toHaveClass('ml-4');
    expect(within(rows[1]).getByText('•')).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent('Built reliable workflows');
  });
});
