#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="${VENV_DIR:-$ROOT_DIR/.venv}"
PYTHON="$VENV_DIR/bin/python"
MODEL="${TRAINING_BASE_MODEL:-mlx-community/VibeThinker-3B-4bit}"
DATA_DIR="${DATA_DIR:-$ROOT_DIR/data/training/mlx-lora}"
RUN_DIR="${RUN_DIR:-$ROOT_DIR/data/checkpoints/preflight}"

if [[ ! -x "$PYTHON" ]]; then
  echo "Python virtual environment not found at $PYTHON"
  echo "Run: npm run setup:training:mac"
  exit 1
fi

"$PYTHON" "$ROOT_DIR/packages/local-model-finetune/scripts/run_mlx_lora.py" \
  --check-only \
  --model "$MODEL" \
  --data-dir "$DATA_DIR" \
  --adapter-path "$RUN_DIR" \
  --max-seconds 60
