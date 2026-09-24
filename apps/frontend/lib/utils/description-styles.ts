export type DescriptionStyle = 'bullet' | 'plain';

export function alignDescriptionStyles(
  descriptions: string[] | undefined,
  styles: (DescriptionStyle | null | undefined)[] | undefined
): DescriptionStyle[] {
  return (descriptions || []).map((_, index) => (styles?.[index] === 'plain' ? 'plain' : 'bullet'));
}

/** A description point paired with its style, so a reorder moves both together. */
export interface DescriptionRow {
  /** Drag-and-drop id (the point's position when the rows were built). */
  id: number;
  text: string;
  style: DescriptionStyle;
}

export function toDescriptionRows(
  descriptions: string[] | undefined,
  styles: (DescriptionStyle | null | undefined)[] | undefined
): DescriptionRow[] {
  const alignedStyles = alignDescriptionStyles(descriptions, styles);
  return (descriptions || []).map((text, index) => ({
    id: index,
    text,
    style: alignedStyles[index],
  }));
}

export function fromDescriptionRows(rows: DescriptionRow[]): {
  description: string[];
  descriptionStyles: DescriptionStyle[];
} {
  return {
    description: rows.map((row) => row.text),
    descriptionStyles: rows.map((row) => row.style),
  };
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
