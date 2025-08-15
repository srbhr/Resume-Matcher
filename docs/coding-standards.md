# Coding Standards

## Python

- **PEP8 Compliance:** Follow [PEP8](https://peps.python.org/pep-0008/) for code style.
- **Naming:** Use `snake_case` for variables/functions, `PascalCase` for classes.
- **Imports:** Group imports (standard, third-party, local) and sort alphabetically.
- **Type Hints:** Use type annotations for function signatures.
- **Docstrings:** Add docstrings for modules, classes, and functions (use Google or NumPy style).
- **Line Length:** Limit lines to 88 characters (Black default).
- **Formatting:** Use [Black](https://github.com/psf/black) for auto-formatting.
- **Linting:** Use [flake8](https://flake8.pycqa.org/) or [ruff](https://github.com/astral-sh/ruff) for linting.
- **Testing:** Write unit tests using `pytest`. Name test files as `test_*.py`.
- **Exceptions:** Catch specific exceptions; avoid bare `except:`.

## JavaScript / TypeScript

- **ESLint:** Use [ESLint](https://eslint.org/) for linting and code quality.
- **Prettier:** Use [Prettier](https://prettier.io/) for consistent formatting.
- **Naming:** Use `camelCase` for variables/functions, `PascalCase` for classes/components.
- **Semicolons:** Always use semicolons.
- **Quotes:** Prefer single quotes `'` for strings; double quotes `"` for JSX.
- **Imports:** Use ES6 module syntax; group and sort imports.
- **Type Safety:** Use TypeScript for new code; annotate types explicitly.
- **Comments:** Use JSDoc for documenting functions and classes.
- **Testing:** Use `jest` or `vitest` for unit tests. Name test files as `*.test.js` or `*.spec.js`.
- **React:** Use functional components and hooks; avoid class components.

---

> **Tip:** Run `black .` for Python and `npm run format` for JS/TS before