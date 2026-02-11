# Codebase Navigator Reference

## Ripgrep Cheat Sheet

### Basic Patterns

```bash
# Literal search
rg 'exact text' apps/

# Regex search
rg 'func_\w+' apps/backend/ --type py

# Case insensitive
rg -i 'mypattern' apps/

# Whole word
rg -w 'useState' apps/frontend/

# Files matching pattern
rg --files | rg 'schema'

# Show context (3 lines before/after)
rg -C 3 'def process_resume' apps/backend/
```

### File Type Filters

```bash
rg --type py 'pattern'          # Python files
rg --glob '*.tsx' 'pattern'     # TSX files
rg --glob '*.{ts,tsx}' 'pattern' # TS and TSX
rg --glob '!*.test.*' 'pattern'  # Exclude test files
rg --type-add 'web:*.{html,css,js,ts,tsx}' --type web 'pattern'
```

### Advanced Patterns

```bash
# Multiline (e.g., function with decorator)
rg -U '@router.post.*\ndef \w+' apps/backend/ --type py

# Only filenames
rg -l 'BaseModel' apps/backend/ --type py

# Count matches per file
rg -c 'import' apps/frontend/ --glob '*.tsx'

# Replace preview (dry run)
rg 'old_name' --replace 'new_name' apps/

# JSON output for programmatic use
rg --json 'pattern' apps/
```

## Resume Matcher Specific Patterns

### Backend Patterns

```bash
# All API routes with HTTP method
rg '@(router|app)\.(get|post|put|patch|delete)\(' apps/backend/ --type py

# All Pydantic models
rg 'class \w+\(BaseModel' apps/backend/ --type py

# All service functions
rg '(def|async def) \w+' apps/backend/app/services/ --type py

# Database operations
rg '(table|db)\.\w+' apps/backend/ --type py

# LLM calls
rg '(litellm|llm)\.' apps/backend/ --type py

# Error handlers
rg 'HTTPException|raise ' apps/backend/ --type py
```

### Frontend Patterns

```bash
# All page components (Next.js)
rg 'export default' apps/frontend/app/ --glob '*.tsx'

# All custom hooks
rg 'export (function|const) use\w+' apps/frontend/hooks/ --glob '*.ts'

# All API calls from frontend
rg '(fetch|api)\.(get|post|put|patch|delete)' apps/frontend/ --glob '*.{ts,tsx}'

# State management
rg '(useState|useReducer|useContext|createContext)' apps/frontend/ --glob '*.{ts,tsx}'

# i18n usage
rg '(useTranslations|t\()' apps/frontend/ --glob '*.{ts,tsx}'

# Swiss design tokens
rg '(rounded-none|shadow-\[|border-black|font-mono|font-serif)' apps/frontend/ --glob '*.tsx'
```

## ack Equivalents

If ripgrep is unavailable, use ack:

```bash
# Same searches with ack
ack --type=python 'def process_resume' apps/backend/
ack --type=tsx '<MyComponent' apps/frontend/
ack --noheading 'TODO|FIXME' apps/
```

## GNU grep Equivalents

As a last resort:

```bash
# Recursive with line numbers
grep -rn 'pattern' apps/ --include='*.py' --exclude-dir=__pycache__
grep -rn 'pattern' apps/ --include='*.tsx' --exclude-dir=node_modules
```
