#!/usr/bin/env bash
# Meetly launcher — pick web, desktop, or local DB.
set -euo pipefail

cd "$(dirname "$0")"

OS="$(uname -s)"
case "$OS" in
  Darwin) HOST="mac" ;;
  MINGW*|MSYS*|CYGWIN*|Windows_NT) HOST="windows" ;;
  *) HOST="other" ;;
esac

if [[ ! -d node_modules ]]; then
  echo "Installing dependencies…"
  npm install
fi

free_port() {
  local port="$1"
  local pids
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -z "$pids" ]]; then
    return 0
  fi
  echo "  Port $port is already in use (PID: $pids)."
  read -r -p "  Kill it and continue? [Y/n]: " answer
  case "${answer:-Y}" in
    n|N|no|No) echo "Aborted."; exit 1 ;;
  esac
  # shellcheck disable=SC2086
  kill $pids 2>/dev/null || true
  sleep 0.4
  echo "  Port $port freed."
}

ensure_db() {
  # Shared desktop↔web data needs local Supabase (Docker).
  if [[ ! -f .env.local ]]; then
    echo "  No .env.local — running local-only (desktop & web won't share data)."
    echo "  Run option 4 first to start the Docker DB + write .env.local."
    return 0
  fi
  if npx supabase status >/dev/null 2>&1; then
    return 0
  fi
  echo "  Local DB is not running. Starting Supabase (Docker)…"
  npx supabase start
  echo ""
}

write_env_local() {
  local keys api
  keys="$(npx supabase status -o env 2>/dev/null || true)"
  api="$(printf '%s\n' "$keys" | sed -n 's/^API_URL=//p' | tr -d '"')"
  anon="$(printf '%s\n' "$keys" | sed -n 's/^ANON_KEY=//p' | tr -d '"')"
  if [[ -z "$api" || -z "$anon" ]]; then
    # Fallback: JSON status
    api="http://127.0.0.1:54321"
    anon="$(npx supabase status -o json 2>/dev/null | sed -n 's/.*"ANON_KEY":"\([^"]*\)".*/\1/p')"
  fi
  if [[ -z "$anon" ]]; then
    echo "Could not read ANON_KEY from supabase status."
    exit 1
  fi
  cat > .env.local <<EOF
# Local Supabase (Docker) — shared DB for desktop + web sync.
VITE_SUPABASE_URL=${api}
VITE_SUPABASE_ANON_KEY=${anon}
EOF
  echo "  Wrote .env.local → ${api}"
}

echo ""
echo "  Meetly — how do you want to run it?"
echo ""
echo "  1) web              — browser at http://localhost:1420"
echo "  2) desktop mac      — Tauri app on this Mac"
echo "  3) desktop windows  — Tauri app on Windows"
echo "  4) start db         — local Supabase in Docker (needed to sync data)"
echo "  5) stop db          — stop local Supabase"
echo ""
read -r -p "  Choose [1-5]: " choice
echo ""

case "$choice" in
  1|web|w)
    ensure_db
    free_port 1420
    echo "Starting web app…"
    echo "Sign in with the same account as desktop to see synced meetings."
    exec npm run dev
    ;;
  2|mac|m|"desktop mac")
    if [[ "$HOST" != "mac" ]]; then
      echo "Desktop Mac only works on macOS. You're on: $OS"
      exit 1
    fi
    ensure_db
    echo "Starting desktop (macOS)…"
    echo "Sign in once — local meetings upload to the DB, then appear on web."
    exec npm run app
    ;;
  3|windows|win|"desktop windows")
    if [[ "$HOST" != "windows" ]]; then
      echo "Desktop Windows must be built and run on a Windows machine"
      echo "(Tauri can't cross-compile the Windows installer from macOS)."
      echo ""
      echo "On Windows, run:  ./start.sh  → choose option 3"
      echo "Or:               npm run app"
      exit 1
    fi
    ensure_db
    echo "Starting desktop (Windows)…"
    exec npm run app
    ;;
  4|db|"start db")
    echo "Starting local Supabase (Docker)…"
    npx supabase start
    write_env_local
    echo ""
    echo "  Studio UI: http://127.0.0.1:54323"
    echo "  Restart web/desktop after this so they pick up .env.local."
    ;;
  5|"stop db"|stop)
    echo "Stopping local Supabase…"
    npx supabase stop
    ;;
  *)
    echo "Invalid choice. Pick 1–5."
    exit 1
    ;;
esac
