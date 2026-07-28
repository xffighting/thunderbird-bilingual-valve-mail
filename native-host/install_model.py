#!/usr/bin/env python3
"""Install the pinned English to Chinese Argos model without heavy ML frameworks."""

from __future__ import annotations

import hashlib
import pathlib
import shutil
import sys
import tempfile
import urllib.request
import zipfile

MODEL_URL = "https://argos-net.com/v1/translate-en_zh-1_9.argosmodel"
MODEL_SHA256 = "433e7c4f034d87fbe2353161e05f18646d7999452f801a4e1f0378522b9850ab"
ARCHIVE_ROOT = "translate-en_zh-1_9"


def sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: install_model.py MODEL_DIR CACHE_DIR")

    model_dir = pathlib.Path(sys.argv[1])
    cache_dir = pathlib.Path(sys.argv[2])
    if (model_dir / "model/model.bin").is_file() and (model_dir / "sentencepiece.model").is_file():
        print("English to Chinese model is already installed.")
        return

    cache_dir.mkdir(parents=True, exist_ok=True)
    archive_path = cache_dir / "translate-en_zh-1_9.argosmodel"
    if not archive_path.is_file() or sha256(archive_path) != MODEL_SHA256:
        print("Downloading the English to Chinese offline model...")
        urllib.request.urlretrieve(MODEL_URL, archive_path)

    if sha256(archive_path) != MODEL_SHA256:
        raise RuntimeError("Offline translation model checksum verification failed")

    with tempfile.TemporaryDirectory(prefix="lianggu-mail-model-") as temp_dir:
        temp_root = pathlib.Path(temp_dir)
        with zipfile.ZipFile(archive_path) as archive:
            required_files = [
                f"{ARCHIVE_ROOT}/sentencepiece.model",
                f"{ARCHIVE_ROOT}/model/config.json",
                f"{ARCHIVE_ROOT}/model/model.bin",
                f"{ARCHIVE_ROOT}/model/shared_vocabulary.json",
            ]
            for member in required_files:
                archive.extract(member, temp_root)

        extracted_root = temp_root / ARCHIVE_ROOT
        model_dir.parent.mkdir(parents=True, exist_ok=True)
        if model_dir.exists():
            shutil.rmtree(model_dir)
        shutil.copytree(extracted_root, model_dir)
    archive_path.unlink(missing_ok=True)
    print("English to Chinese offline model installed.")


if __name__ == "__main__":
    main()
