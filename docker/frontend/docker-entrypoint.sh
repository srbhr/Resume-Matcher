#!/bin/sh
set -e

# Writes runtime config from environment variables into public/runtime-config.js
# so the browser can read window.__RUNTIME_CONFIG at runtime without rebuilding.
RUNTIME_FILE=/app/public/runtime-config.js
BACKEND_URL="${NEXT_PUBLIC_API_URL:-}"

# Generate the runtime config file using printf to avoid shell interpretation of special chars
{
  printf "// runtime-config.js - generated at container start\n"
  printf "(function(){\n"
  printf "  function safeDefault(){\n"
  printf "    // Default to page host and backend port 8000\n"
  printf "    var proto = window.location.protocol %s 'http:';\n" "||"
  printf "    var host = window.location.hostname;\n"
  printf "    var port = '8000';\n"
  printf "    return proto + '//' + host + ':' + port;\n"
  printf "  }\n"
  printf "\n"
  printf "  var apiUrl = '';\n"
  printf "  try{\n"

  if [ -z "$BACKEND_URL" ]; then
    printf "    // No backend URL configured, use default\n"
    printf "    apiUrl = safeDefault();\n"
  else
    printf "    // Backend URL configured: %s\n" "$BACKEND_URL"
    printf "    var raw = '%s';\n" "$BACKEND_URL"
    printf "\n"
    printf "    try{\n"
    printf "      var u = new URL(raw);\n"
    printf "      var host = u.hostname %s '';\n" "||"
    printf "      // If hostname is a Docker service name (no dots), replace with page hostname\n"
    printf "      if(host.indexOf('.') === -1 %s host !== 'localhost'){\n" "&&"
    printf "        // Docker service name detected, replace with actual page host for remote access\n"
    printf "        u.hostname = window.location.hostname;\n"
    printf "        apiUrl = u.origin;\n"
    printf "      } else if(host === 'host.docker.internal'){\n"
    printf "        // Docker special hostname, replace with page hostname\n"
    printf "        u.hostname = window.location.hostname;\n"
    printf "        apiUrl = u.origin;\n"
    printf "      } else {\n"
    printf "        apiUrl = u.origin;\n"
    printf "      }\n"
    printf "    }catch(e){\n"
    printf "      apiUrl = safeDefault();\n"
    printf "    }\n"
  fi

  printf "  }catch(e){\n"
  printf "    apiUrl = safeDefault();\n"
  printf "  }\n"
  printf "\n"
  printf "  window.__RUNTIME_CONFIG = { NEXT_PUBLIC_API_URL: apiUrl };\n"
  printf "})();\n"
} > "$RUNTIME_FILE"


# Masked log for debugging
if [ -n "$BACKEND_URL" ]; then
  echo "[entrypoint] NEXT_PUBLIC_API_URL provided at container start: ${BACKEND_URL%%:*}..."
else
  echo "[entrypoint] NEXT_PUBLIC_API_URL not provided; runtime-config will default to window.location.hostname:8000"
fi

# Execute the container CMD
exec "$@"
