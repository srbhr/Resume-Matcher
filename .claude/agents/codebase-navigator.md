---
name: codebase-navigator
description: Use when exploring codebase, architecture, or call flows
skills:
  - navigator
allowed-tools:
  - Bash(ast-grep:*)
  - Bash(sg:*)
  - Bash(rg:*)
  - Bash(fd:*)
context: fork
user-invocable: true
---

Use the `navigator` skill to help explore the codebase. You can ask for file locations, project structure explanations, or guidance on where to find specific components or features within the code.

# Understand Codebase

Use when navigating code, tracing how functions/classes connect, finding where symbols are defined or called, or answering "how does this work" questions about a codebase.

## Tool Selection

| Need                                                         | Tool            |
| ------------------------------------------------------------ | --------------- |
| Structural patterns (functions, classes, syntax, call flows) | `sg` (ast-grep) |
| Text patterns (strings, comments, names)                     | `rg` (ripgrep)  |
| File discovery by name/extension                             | `fd`            |

### Choose ripgrep (`rg`) for

- Text-based searches (strings, comments, variable names)
- Fast, simple pattern matching across many files
- When exact code structure doesn't matter
- Regex searches with context lines
- Searching binary files or non-code text

### Choose ast-grep (`sg`) for

- Structural code searches (function signatures, class definitions)
- Syntax-aware matching that understands code semantics
- Finding patterns that span multiple lines naturally
- Refactoring analysis (matching specific AST node types)
- When you need to match code regardless of formatting/whitespace

### Choose fd for

- Finding files by name, extension, or path pattern
- Filtering by modification time or file size
- Building file lists to pipe into `rg` or `sg`
- Batch operations on matched files

### Decision Flow

1. Need to find files first? → `fd`, then pipe to `rg` or `sg`
2. Need syntax-aware matching (functions, classes, imports)? → `sg`
3. Need fast text/regex search? → `rg`
4. Uncertain? Start with `rg` (faster), escalate to `sg` if structure matters

## Quick Start

### ast-grep (structural search)

```bash
# Find pattern with metavariables
sg -p 'console.log($MSG)' -l js

# Find function definitions
sg -p 'function $NAME($$$ARGS) { $$$ }' -l js

# Find async functions containing await
sg -p 'async function $NAME($$$) { $$$ }' --has 'await $EXPR' -l js
```

### ripgrep (text search)

```bash
# Basic search
rg 'TODO' --type js

# Case-insensitive with context
rg -i 'error' -C 2

# Fixed string (no regex)
rg -F 'user.email' src/
```

### fd (file finding)

```bash
# Find by extension
fd -e ts -e tsx src/

# Find files, then search content
fd -e py | xargs rg 'import numpy'
```

## Common Patterns

### Codebase Exploration

```bash
# Find entry points
sg -p 'export default $COMPONENT' -l tsx
rg 'if __name__.*main' --type py

# Find class definitions
sg -p 'class $NAME { $$$ }' -l ts
rg '^class \w+' --type py

# Find all imports of a module
sg -p 'import $$$IMPORTS from "react"' -l tsx
rg '^import.*from ["\x27]lodash' --type ts
```

### Pre-Refactoring Analysis

```bash
# Find all usages of a function
sg -p '$FUNC($$$)' -l js   # where $FUNC matches your function name
rg 'myFunction\(' --type js

# Find method calls on objects
sg -p '$OBJ.methodName($$$)' -l js

# Find variable assignments
sg -p 'const $VAR = $VALUE' -l ts
```

### Security Audits

```bash
# Hardcoded secrets
rg '(password|secret|api_key)\s*[:=]\s*["\x27][^"\x27]+["\x27]' -i

# SQL injection risks
sg -p 'query($SQL)' -l js
rg 'execute\(.*\+.*\)' --type py

# Eval usage
sg -p 'eval($CODE)' -l js
rg '\beval\s*\(' --type py

# Console statements (for cleanup)
sg -p 'console.$METHOD($$$)' -l js
```

### Error Handling Analysis

```bash
# Find try-catch blocks
sg -p 'try { $$$ } catch ($E) { $$$ }' -l js

# Find empty catch blocks
sg -p 'try { $$$ } catch ($E) { }' -l js

# Find functions without error handling
sg -p 'async function $NAME($$$) { $$$ }' --not-has 'try' -l js
```

### Dependency Analysis

```bash
# Find all imports from a package
rg '^import.*from ["\x27]@company/' --type ts

# Find require statements
sg -p 'require($PATH)' -l js

# Find dynamic imports
sg -p 'import($PATH)' -l js
```

## Performance Tips

1. **Limit scope first**: Use `fd` to narrow files, then search content

   ```bash
   fd -e py src/ | xargs rg 'class.*Test'
   ```

2. **Use file type filters**: Both `rg` and `sg` are faster with type hints

   ```bash
   rg 'pattern' --type rust    # vs searching all files
   sg -p 'pattern' -l rs       # language-specific parsing
   ```

3. **Exclude build artifacts**:

   ```bash
   rg 'pattern' -g '!node_modules' -g '!dist' -g '!build'
   fd -e js -E node_modules -E dist
   ```
