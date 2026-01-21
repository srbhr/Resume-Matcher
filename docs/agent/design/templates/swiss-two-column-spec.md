# Swiss Two Column Template Specification

**ID:** `swiss-two-column`
**Layout:** Two Column Grid (65% / 35%)
**Design System:** Swiss International Style

## Overview
The Swiss Two Column template optimizes for space efficiency. It places the most critical information (experience, projects) in a main left column, and supporting details (education, skills, summary) in a right sidebar. Ideal for technical roles or one-page resumes.

## Typography
Uses the system font stack defined in `_base.module.css`.

| Element | Class (Base) | Font Family | Size | Weight |
|---------|--------------|-------------|------|--------|
| Name | `.resume-name` | Serif | 2em (28px) | 700 |
| Title | `.resume-title` | Sans | 1.05em | 400 |
| Section Header (Main) | `.resume-section-title` | Serif | 1.2em | 700 |
| Section Header (Side) | `.resume-section-title-sm` | Serif | 0.96em | 700 |
| Item Title | `.resume-item-title` | Sans | 1em | 700 |
| Body Text | `.resume-text` | Sans | 1em (14px) | 400 |

## Layout Structure
- **Header:** Full width, centered (outside grid).
- **Grid:** CSS Grid with `65% 35%` columns.
- **Main Column:** Left side. Contains Experience, Projects, Custom Sections.
- **Sidebar:** Right side. Contains Summary, Education, Skills, Languages, Awards, Links.
- **Separation:** Vertical border on the right of the main column.

## CSS Modules
- **Base:** `components/resume/styles/_base.module.css` (Typography, Spacing)
- **Specific:** `components/resume/styles/swiss-two-column.module.css` (Grid, Column Layout)
- **Tokens:** `components/resume/styles/_tokens.css` (Colors)

## Customization
- **Grid:** Defined in `swiss-two-column.module.css`.
- **Borders:** Main column has `border-right` using `--resume-border-tertiary`.
