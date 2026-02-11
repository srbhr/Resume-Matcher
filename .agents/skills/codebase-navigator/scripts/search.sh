#!/usr/bin/env bash
# search.sh - Codebase search utilities using ripgrep, ack, or GNU grep
# Usage: ./search.sh <command> [args...]
#
# Commands:
#   functions <pattern>       Find function/method definitions
#   classes <pattern>         Find class definitions
#   components <pattern>      Find React component definitions
#   endpoints <pattern>       Find API route/endpoint definitions
#   imports <module>          Find all imports of a module
#   exports <pattern>         Find exported symbols
#   types <pattern>           Find type/interface definitions
#   hooks <pattern>           Find React hook definitions/usage
#   todos                     Find TODO/FIXME/HACK comments
#   deps <file>               Find files that import a given file
#   tree [dir]                Show project structure (respects .gitignore)
#   files <pattern>           Find files by name pattern
#   usage <symbol>            Find all usages of a symbol
#   api-routes                List all API route handlers
#   schema <pattern>          Find Pydantic model/schema definitions
#   config                    Find configuration and env var references

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

# Detect available search tool
if command -v rg &>/dev/null; then
  SEARCH_CMD="rg"
elif command -v ack &>/dev/null; then
  SEARCH_CMD="ack"
elif command -v grep &>/dev/null; then
  SEARCH_CMD="grep"
else
  echo "Error: No search tool found. Install ripgrep (rg), ack, or GNU grep." >&2
  exit 1
fi

# Wrapper function for portable searching
search() {
  local pattern="$1"
  shift
  case "$SEARCH_CMD" in
    rg)
      rg --no-heading --line-number --color=never "$@" "$pattern" "$REPO_ROOT" 2>/dev/null || true
      ;;
    ack)
      ack --noheading --nocolor "$@" "$pattern" "$REPO_ROOT" 2>/dev/null || true
      ;;
    grep)
      grep -Ern --color=never "$@" "$pattern" "$REPO_ROOT" \
        --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=__pycache__ \
        --exclude-dir=.git --exclude-dir=venv --exclude-dir=.venv 2>/dev/null || true
      ;;
  esac
}

# Wrapper with file type filtering
search_type() {
  local pattern="$1"
  local filetype="$2"
  case "$SEARCH_CMD" in
    rg)
      rg --no-heading --line-number --color=never --type "$filetype" "$pattern" "$REPO_ROOT" 2>/dev/null || true
      ;;
    ack)
      ack --noheading --nocolor --type="$filetype" "$pattern" "$REPO_ROOT" 2>/dev/null || true
      ;;
    grep)
      local ext
      case "$filetype" in
        py) ext="*.py" ;;
        ts) ext="*.ts" ;;
        tsx) ext="*.tsx" ;;
        js) ext="*.js" ;;
        *) ext="*.$filetype" ;;
      esac
      grep -Ern --color=never --include="$ext" "$pattern" "$REPO_ROOT" \
        --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=__pycache__ \
        --exclude-dir=.git 2>/dev/null || true
      ;;
  esac
}

# Convert a glob pattern to a grep-compatible regex for ack fallback
glob_to_regex() {
  echo "$1" | sed -e 's/\./\\./g' -e 's/\*/.*/g' -e 's/{/(/g' -e 's/}/)/g' -e 's/,/|/g'
}

# Wrapper for glob-based file searching
search_glob() {
  local pattern="$1"
  local glob="$2"
  case "$SEARCH_CMD" in
    rg)
      rg --no-heading --line-number --color=never --glob "$glob" "$pattern" "$REPO_ROOT" 2>/dev/null || true
      ;;
    ack)
      local file_regex
      file_regex=$(glob_to_regex "$glob")
      ack --noheading --nocolor "$pattern" "$REPO_ROOT" 2>/dev/null | grep -E "$file_regex" || true
      ;;
    grep)
      grep -Ern --color=never --include="$glob" "$pattern" "$REPO_ROOT" \
        --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=__pycache__ \
        --exclude-dir=.git 2>/dev/null || true
      ;;
  esac
}

case "${1:-help}" in
  functions)
    PATTERN="${2:-.}"
    echo "=== Python functions ==="
    search_type "(def|async def) +${PATTERN}" py
    echo ""
    echo "=== TypeScript/JavaScript functions ==="
    search_glob "(function |const |export (default )?function |async function )${PATTERN}" "*.{ts,tsx,js,jsx}"
    ;;

  classes)
    PATTERN="${2:-.}"
    echo "=== Python classes ==="
    search_type "^class ${PATTERN}" py
    echo ""
    echo "=== TypeScript classes ==="
    search_glob "^(export )?(abstract )?class ${PATTERN}" "*.{ts,tsx}"
    ;;

  components)
    PATTERN="${2:-.}"
    echo "=== React components (function) ==="
    search_glob "(export (default )?)?function ${PATTERN}" "*.{tsx,jsx}"
    echo ""
    echo "=== React components (const arrow) ==="
    search_glob "export (default )?(const ${PATTERN}|${PATTERN}) *(:|=)" "*.{tsx,jsx}"
    ;;

  endpoints)
    PATTERN="${2:-.}"
    echo "=== FastAPI endpoints ==="
    search_type "@(router|app)\.(get|post|put|patch|delete).*${PATTERN}" py
    echo ""
    echo "=== Next.js API routes ==="
    search_glob "export (async )?function (GET|POST|PUT|PATCH|DELETE).*${PATTERN}" "*.{ts,tsx}"
    ;;

  imports)
    PATTERN="${2:-.}"
    echo "=== Python imports ==="
    search_type "(from .* import|import ).*${PATTERN}" py
    echo ""
    echo "=== JS/TS imports ==="
    search_glob "import .* from .*${PATTERN}" "*.{ts,tsx,js,jsx}"
    ;;

  exports)
    PATTERN="${2:-.}"
    echo "=== TypeScript exports ==="
    search_glob "export (default |type |interface |const |function |class |enum ).*${PATTERN}" "*.{ts,tsx}"
    echo ""
    echo "=== Python __all__ ==="
    search_type "__all__" py
    ;;

  types)
    PATTERN="${2:-.}"
    echo "=== TypeScript types/interfaces ==="
    search_glob "(type|interface|enum) ${PATTERN}" "*.{ts,tsx}"
    echo ""
    echo "=== Pydantic models ==="
    search_type "class ${PATTERN}.*BaseModel" py
    ;;

  hooks)
    PATTERN="${2:-use}"
    echo "=== React hook definitions ==="
    search_glob "(export )?(function|const) ${PATTERN}" "*.{ts,tsx}"
    echo ""
    echo "=== Hook usages ==="
    search_glob "${PATTERN}\(" "*.{ts,tsx}"
    ;;

  todos)
    echo "=== TODO/FIXME/HACK comments ==="
    search "(TODO|FIXME|HACK|XXX|WARN):"
    ;;

  deps)
    FILE="${2:-}"
    if [ -z "$FILE" ]; then
      echo "Usage: search.sh deps <filename>"
      exit 1
    fi
    BASENAME=$(basename "$FILE" | sed 's/\.[^.]*$//')
    echo "=== Files importing ${BASENAME} ==="
    search "(import|from|require).*${BASENAME}"
    ;;

  tree)
    DIR="${2:-$REPO_ROOT}"
    echo "=== Project structure ==="
    if command -v tree &>/dev/null; then
      tree -I 'node_modules|.next|__pycache__|.git|venv|.venv|.mypy_cache' -L 3 "$DIR"
    else
      find "$DIR" -maxdepth 3 \
        -not -path '*/node_modules/*' \
        -not -path '*/.next/*' \
        -not -path '*/__pycache__/*' \
        -not -path '*/.git/*' \
        -not -path '*/venv/*' \
        -not -path '*/.venv/*' \
        -print | sort
    fi
    ;;

  files)
    PATTERN="${2:-.}"
    echo "=== Files matching: ${PATTERN} ==="
    case "$SEARCH_CMD" in
      rg)
        rg --files --color=never "$REPO_ROOT" 2>/dev/null | grep -i "$PATTERN" || true
        ;;
      *)
        find "$REPO_ROOT" -type f -name "*${PATTERN}*" \
          -not -path '*/node_modules/*' \
          -not -path '*/.next/*' \
          -not -path '*/__pycache__/*' \
          -not -path '*/.git/*' | sort
        ;;
    esac
    ;;

  usage)
    PATTERN="${2:-.}"
    echo "=== Usages of: ${PATTERN} ==="
    search "\b${PATTERN}\b"
    ;;

  api-routes)
    echo "=== Backend API routes (FastAPI) ==="
    search_type "@(router|app)\.(get|post|put|patch|delete)\(" py
    echo ""
    echo "=== Route prefixes ==="
    search_type "APIRouter\(prefix=" py
    echo ""
    echo "=== Frontend API calls ==="
    search_glob "fetch\(|api\.(get|post|put|patch|delete)\(" "*.{ts,tsx}"
    ;;

  schema)
    PATTERN="${2:-.}"
    echo "=== Pydantic schemas ==="
    search_type "class ${PATTERN}.*(BaseModel|BaseSettings)" py
    echo ""
    echo "=== TypeScript types for API ==="
    search_glob "(type|interface) ${PATTERN}" "*.{ts,tsx}"
    ;;

  config)
    echo "=== Environment variables ==="
    search_type "(os\.environ|os\.getenv|settings\.|\.env)" py
    echo ""
    echo "=== Frontend env ==="
    search_glob "(process\.env\.|NEXT_PUBLIC_)" "*.{ts,tsx,js}"
    echo ""
    echo "=== Config files ==="
    search_glob "." "*.env*"
    ;;

  help|*)
    echo "Codebase Search Tool"
    echo ""
    echo "Usage: $0 <command> [pattern]"
    echo ""
    echo "Commands:"
    echo "  functions <pattern>    Find function/method definitions"
    echo "  classes <pattern>      Find class definitions"
    echo "  components <pattern>   Find React component definitions"
    echo "  endpoints [pattern]    Find API route/endpoint definitions"
    echo "  imports <module>       Find all imports of a module"
    echo "  exports <pattern>      Find exported symbols"
    echo "  types <pattern>        Find type/interface definitions"
    echo "  hooks <pattern>        Find React hook definitions/usage"
    echo "  todos                  Find TODO/FIXME/HACK comments"
    echo "  deps <file>            Find files that import a given file"
    echo "  tree [dir]             Show project structure"
    echo "  files <pattern>        Find files by name"
    echo "  usage <symbol>         Find all usages of a symbol"
    echo "  api-routes             List all API route handlers"
    echo "  schema <pattern>       Find Pydantic/TS type definitions"
    echo "  config                 Find config and env references"
    ;;
esac
