# Swiss Single Column Template Specification

**ID:** `swiss-single`
**Layout:** Single Column (Vertical Stack)
**Design System:** Swiss International Style

## Overview
The Swiss Single Column template is a traditional, clean, and highly readable layout. It emphasizes content hierarchy through bold typography and generous whitespace. It is the default template and is suitable for most professions, especially those requiring detailed descriptions of experience.

## Typography
Uses the system font stack defined in `_base.module.css`.

| Element | Class (Base) | Font Family | Size | Weight |
|---------|--------------|-------------|------|--------|
| Name | `.resume-name` | Serif | 2em (28px) | 700 |
| Title | `.resume-title` | Sans | 1.05em | 400 |
| Section Header | `.resume-section-title` | Serif | 1.2em | 700 |
| Item Title | `.resume-item-title` | Sans | 1em | 700 |
| Body Text | `.resume-text` | Sans | 1em (14px) | 400 |
| Metadata | `.resume-meta` | Mono | 0.82em | 400 |

## Layout Structure
- **Header:** Centered name, title, and contact info.
- **Body:** Vertical stack of sections.
- **Sections:** Full width.
- **Items:** Full width, with metadata (years, location) often floated or flex-aligned.

## CSS Modules
- **Base:** `components/resume/styles/_base.module.css` (Typography, Spacing)
- **Specific:** `components/resume/styles/swiss-single.module.css` (Container)
- **Tokens:** `components/resume/styles/_tokens.css` (Colors)

## Customization
- **Colors:** Edit `_tokens.css` to change global theme, or override CSS variables in inline styles.
- **Spacing:** Adjust `--section-gap` and `--item-gap` in resume settings.
