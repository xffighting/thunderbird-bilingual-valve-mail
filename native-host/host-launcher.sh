#!/bin/zsh
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export LIANGGU_TRANSLATION_MODEL_DIR="${SCRIPT_DIR}/model"

exec "${SCRIPT_DIR}/venv/bin/python" "${SCRIPT_DIR}/translator_host.py" "$@"
