#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="${PYTHON_BIN:-python3}"
VENV_DIR="${VENV_DIR:-$ROOT_DIR/.venv}"
REQUIREMENTS_FILE="$ROOT_DIR/packages/local-model-finetune/requirements-macos-mlx.txt"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This setup script is for macOS."
  exit 1
fi

if [[ "$(uname -m)" != "arm64" ]]; then
  echo "This MLX training setup currently requires Apple Silicon (arm64)."
  exit 1
fi

"$PYTHON_BIN" -m venv "$VENV_DIR"
"$VENV_DIR/bin/python" -m pip install --upgrade pip setuptools wheel
"$VENV_DIR/bin/pip" install -r "$REQUIREMENTS_FILE"

echo
echo "Local training environment is ready."
echo "Virtual environment: $VENV_DIR"
echo "Next step: npm run check:training:mac"
