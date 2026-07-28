#!/bin/zsh
set -eu

SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="${HOME}/Library/Application Support/Lianggu/MailTranslator"
MANIFEST_DIR="${HOME}/Library/Mozilla/NativeMessagingHosts"
MANIFEST_PATH="${MANIFEST_DIR}/com.lianggu.mail_translate.json"
if [[ -z "${PYTHON_BIN:-}" ]]; then
  for candidate in \
    "${HOME}/.local/bin/python3.11" \
    "${HOME}/.local/bin/python3.12" \
    "$(command -v python3 2>/dev/null || true)"; do
    if [[ -x "${candidate}" ]]; then
      PYTHON_BIN="${candidate}"
      break
    fi
  done
fi

if [[ -z "${PYTHON_BIN:-}" ]]; then
  echo "Python 3.10 or newer is required."
  exit 1
fi

mkdir -p "${APP_DIR}" "${MANIFEST_DIR}"

if [[ -x "${APP_DIR}/venv/bin/python" ]] && ! "${APP_DIR}/venv/bin/python" -c \
  'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)'; then
  mv "${APP_DIR}/venv" "${APP_DIR}/venv-incompatible-$(date +%Y%m%d%H%M%S)"
fi

if [[ -x "${APP_DIR}/venv/bin/python" ]] && [[ ! -f "${APP_DIR}/venv/.lianggu-lite-runtime-v1" ]]; then
  mv "${APP_DIR}/venv" "${APP_DIR}/venv-legacy-$(date +%Y%m%d%H%M%S)"
fi

if [[ ! -x "${APP_DIR}/venv/bin/python" ]]; then
  "${PYTHON_BIN}" -m venv "${APP_DIR}/venv"
fi

PIP_DISABLE_PIP_VERSION_CHECK=1 "${APP_DIR}/venv/bin/python" -m pip install \
  --quiet \
  "ctranslate2==4.8.1" \
  "sentencepiece==0.2.2"
touch "${APP_DIR}/venv/.lianggu-lite-runtime-v1"

cp "${SOURCE_DIR}/translator_host.py" "${APP_DIR}/translator_host.py"
cp "${SOURCE_DIR}/valve_glossary.json" "${APP_DIR}/valve_glossary.json"
cp "${SOURCE_DIR}/host-launcher.sh" "${APP_DIR}/host-launcher.sh"
chmod 700 "${APP_DIR}/host-launcher.sh" "${APP_DIR}/translator_host.py"
chmod 600 "${APP_DIR}/valve_glossary.json"

if [[ -d "${APP_DIR}/data/argos-translate/packages/translate-en_zh-1_9" ]] && [[ ! -d "${APP_DIR}/model" ]]; then
  mkdir -p "${APP_DIR}/model"
  cp "${APP_DIR}/data/argos-translate/packages/translate-en_zh-1_9/sentencepiece.model" "${APP_DIR}/model/"
  cp -R "${APP_DIR}/data/argos-translate/packages/translate-en_zh-1_9/model" "${APP_DIR}/model/"
fi
"${APP_DIR}/venv/bin/python" "${SOURCE_DIR}/install_model.py" \
  "${APP_DIR}/model" \
  "${APP_DIR}/cache"
"${APP_DIR}/venv/bin/python" "${SOURCE_DIR}/install_reply_models.py" \
  "${APP_DIR}/models" \
  "${APP_DIR}/cache"

"${PYTHON_BIN}" "${SOURCE_DIR}/write_manifest.py" \
  "${MANIFEST_PATH}" \
  "${APP_DIR}/host-launcher.sh"

"${APP_DIR}/host-launcher.sh" --self-test

echo "Offline translator installed for Thunderbird."
