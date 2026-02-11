#!/usr/bin/env bash
# trace.sh - Trace call flows and data paths through the codebase
# Usage: ./trace.sh <command> [args...]
#
# Commands:
#   api-flow <endpoint>       Trace an API endpoint from route to service to response
#   component-tree <name>     Find component hierarchy (parent -> children)
#   data-flow <field>         Trace a data field from API to UI
#   middleware                 List all middleware and their order
#   state <key>               Trace state management flow for a key

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
BACKEND="$REPO_ROOT/apps/backend"
FRONTEND="$REPO_ROOT/apps/frontend"

rg_safe() {
  rg --no-heading --line-number --color=never "$@" 2>/dev/null || true
}

case "${1:-help}" in
  api-flow)
    ENDPOINT="${2:-.}"
    echo "=== 1. Route handler ==="
    rg_safe "@(router|app)\.(get|post|put|patch|delete).*${ENDPOINT}" "$BACKEND" --type py
    echo ""
    echo "=== 2. Service layer calls ==="
    rg_safe "from .*(services|service) import|services\." "$BACKEND" --type py | grep -i "${ENDPOINT%%/*}" || true
    echo ""
    echo "=== 3. Schema/model definitions ==="
    rg_safe "class.*${ENDPOINT%%/*}.*BaseModel" "$BACKEND" --type py -i || true
    echo ""
    echo "=== 4. Frontend API calls ==="
    rg_safe "${ENDPOINT}" "$FRONTEND" --type ts --type tsx || true
    ;;

  component-tree)
    COMPONENT="${2:-.}"
    echo "=== Component definition ==="
    rg_safe "(export (default )?)?function ${COMPONENT}" "$FRONTEND" --glob "*.{tsx,jsx}"
    echo ""
    echo "=== Used by (parents) ==="
    rg_safe "<${COMPONENT}[\s/>]" "$FRONTEND" --glob "*.{tsx,jsx}"
    echo ""
    echo "=== Imports (children/deps) ==="
    # Find the file first, then list its imports
    FILE=$(rg_safe --files-with-matches "function ${COMPONENT}" "$FRONTEND" --glob "*.{tsx,jsx}" | head -1)
    if [ -n "$FILE" ]; then
      echo "File: $FILE"
      rg_safe "^import " "$FILE"
    fi
    ;;

  data-flow)
    FIELD="${2:-.}"
    echo "=== 1. Backend schema field ==="
    rg_safe "${FIELD}" "$BACKEND/app/schemas/" --type py || true
    echo ""
    echo "=== 2. Backend service usage ==="
    rg_safe "${FIELD}" "$BACKEND/app/services/" --type py || true
    echo ""
    echo "=== 3. Backend router usage ==="
    rg_safe "${FIELD}" "$BACKEND/app/routers/" --type py || true
    echo ""
    echo "=== 4. Frontend API client ==="
    rg_safe "${FIELD}" "$FRONTEND/lib/" --glob "*.{ts,tsx}" || true
    echo ""
    echo "=== 5. Frontend component usage ==="
    rg_safe "${FIELD}" "$FRONTEND/components/" --glob "*.{tsx,jsx}" || true
    echo ""
    echo "=== 6. Frontend page usage ==="
    rg_safe "${FIELD}" "$FRONTEND/app/" --glob "*.{tsx,jsx}" || true
    ;;

  middleware)
    echo "=== FastAPI middleware ==="
    rg_safe "add_middleware|@app\.middleware" "$BACKEND" --type py
    echo ""
    echo "=== Next.js middleware ==="
    if [ -f "$FRONTEND/middleware.ts" ]; then
      rg_safe "." "$FRONTEND/middleware.ts"
    elif [ -f "$FRONTEND/middleware.tsx" ]; then
      rg_safe "." "$FRONTEND/middleware.tsx"
    else
      echo "(no middleware.ts found)"
    fi
    echo ""
    echo "=== Next.js route wrappers ==="
    rg_safe "withAuth|withLayout|withProvider" "$FRONTEND" --glob "*.{ts,tsx}" || true
    ;;

  state)
    KEY="${2:-.}"
    echo "=== State stores/context ==="
    rg_safe "(createContext|useContext|useState|useReducer|create\().*${KEY}" "$FRONTEND" --glob "*.{ts,tsx}" -i || true
    echo ""
    echo "=== LocalStorage usage ==="
    rg_safe "localStorage\.(get|set)Item.*${KEY}" "$FRONTEND" --glob "*.{ts,tsx}" -i || true
    echo ""
    echo "=== Hook state management ==="
    rg_safe "${KEY}" "$FRONTEND/hooks/" --glob "*.{ts,tsx}" || true
    ;;

  help|*)
    echo "Call Flow Tracer"
    echo ""
    echo "Usage: $0 <command> [args]"
    echo ""
    echo "Commands:"
    echo "  api-flow <endpoint>       Trace API endpoint flow"
    echo "  component-tree <name>     Find component hierarchy"
    echo "  data-flow <field>         Trace data from backend to frontend"
    echo "  middleware                 List all middleware"
    echo "  state <key>               Trace state management"
    ;;
esac
