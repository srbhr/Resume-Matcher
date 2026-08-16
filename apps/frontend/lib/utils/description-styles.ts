export type DescriptionStyle = 'bullet' | 'plain';

export function alignDescriptionStyles(
  descriptions: string[] | undefined,
  styles: (DescriptionStyle | null | undefined)[] | undefined
): DescriptionStyle[] {
  return (descriptions || []).map((_, index) => (styles?.[index] === 'plain' ? 'plain' : 'bullet'));
}

export function toggleDescriptionStyle(
  descriptions: string[] | undefined,
  styles: (DescriptionStyle | null | undefined)[] | undefined,
  index: number
): DescriptionStyle[] {
  const alignedStyles = alignDescriptionStyles(descriptions, styles);

  if (index < 0 || index >= alignedStyles.length) {
    return alignedStyles;
  }

  alignedStyles[index] = alignedStyles[index] === 'plain' ? 'bullet' : 'plain';
  return alignedStyles;
}
