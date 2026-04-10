import React from 'react';
import { sanitizeHtml } from '@/lib/utils/html-sanitizer';
import { cn } from '@/lib/utils';

// No 'use client' — this component does no client-only work (no hooks, no
// event handlers, no browser APIs). Sanitization runs on the server via
// isomorphic-dompurify. Parent resume templates (resume-single-column,
// resume-modern, etc.) are also Server Components, so this can render on
// the server and stays out of the client bundle.

interface SafeHtmlProps {
  /** HTML content to render (will be sanitized) */
  html: string;
  /** Additional CSS classes */
  className?: string;
  /** Render as a different element (default: span) */
  as?: 'span' | 'div' | 'p';
}

/**
 * Safe HTML Renderer Component
 *
 * Renders HTML content with XSS protection via DOMPurify.
 * Only allows: <strong>, <em>, <u>, <a> tags.
 *
 * Used in resume templates to render formatted bullet points.
 */
export const SafeHtml: React.FC<SafeHtmlProps> = ({ html, className, as: Component = 'span' }) => {
  // Handle empty or undefined content
  if (!html) {
    return null;
  }

  // Sanitize the HTML before rendering
  const cleanHtml = sanitizeHtml(html);

  return (
    <Component
      className={cn(
        // Ensure links are styled consistently in resume output
        '[&_a]:text-inherit [&_a]:underline',
        className
      )}
      dangerouslySetInnerHTML={{ __html: cleanHtml }}
    />
  );
};

export default SafeHtml;
