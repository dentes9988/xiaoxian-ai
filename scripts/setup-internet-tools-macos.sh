#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_DIR="${AGENT_REACH_HOME:-$HOME/.agent-reach}"
CONFIG_PATH="$CONFIG_DIR/mcporter.json"
MCPORTER_BIN="$ROOT_DIR/node_modules/.bin/mcporter"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This setup script is for macOS."
  exit 1
fi

if [[ ! -x "$MCPORTER_BIN" ]]; then
  npm install --prefix "$ROOT_DIR"
fi

if ! python3 -m pipx --version >/dev/null 2>&1; then
  python3 -m pip install --user pipx
fi

if ! python3 -m pipx install agent-reach; then
  python3 -m pipx upgrade agent-reach
fi

mkdir -p "$CONFIG_DIR"
"$MCPORTER_BIN" --config "$CONFIG_PATH" config add exa https://mcp.exa.ai/mcp
"$MCPORTER_BIN" config add exa https://mcp.exa.ai/mcp --scope home
node "$ROOT_DIR/scripts/check-internet-tools.mjs"

echo
echo "Internet tools are ready."
echo "Core channels: Exa web search, Jina webpage reader, and GitHub search when gh is installed."
