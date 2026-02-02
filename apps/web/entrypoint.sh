#!/bin/sh
set -e

RUNTIME_CONFIG_PATH="/app/apps/web/dist/runtime-config.js"
API_URL="${VITE_API_URL:-}"
PORT="${WEB_PORT:-${PORT:-3000}}"

if [ -n "$API_URL" ]; then
  echo "window.__MUDARR_CONFIG__ = { apiBaseUrl: \"${API_URL}\" };" > "$RUNTIME_CONFIG_PATH"
fi

exec npm run preview -- --host 0.0.0.0 --port "$PORT"
