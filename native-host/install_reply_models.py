#!/usr/bin/env python3
"""Install pinned offline models for Chinese, English, Russian and Arabic replies."""

from __future__ import annotations

import hashlib
import json
import pathlib
import shutil
import sys
import tempfile
import urllib.request
import zipfile

MODEL_SPECS = [
    {
        "model_id": "translate-ru_en-1_0",
        "source": "ru",
        "target": "en",
        "archive_root": "ru_en",
        "url": "https://argos-net.com/v1/translate-ru_en-1_0.argosmodel",
        "sha256": "cfda9fc0b2164a525a9db96d8bfd8f20c15c366fef971462ac5abb29f3feba45",
    },
    {
        "model_id": "translate-zh_en-1_9",
        "source": "zh",
        "target": "en",
        "archive_root": "translate-zh_en-1_9",
        "url": "https://argos-net.com/v1/translate-zh_en-1_9.argosmodel",
        "sha256": "62e7af5a3a48b530e47b7b3e5c78c2de79073ecd815750d2bf3ab35b4a67da2d",
    },
    {
        "model_id": "translate-en_ru-1_9",
        "source": "en",
        "target": "ru",
        "archive_root": "translate-en_ru-1_9",
        "url": "https://argos-net.com/v1/translate-en_ru-1_9.argosmodel",
        "sha256": "591d743ae103752b88ffc38785c50421320f4eff93c8967e0d3d2e14d4e27811",
    },
    {
        "model_id": "translate-en_ar-1_0",
        "source": "en",
        "target": "ar",
        "archive_root": "en_ar",
        "url": "https://argos-net.com/v1/translate-en_ar-1_0.argosmodel",
        "sha256": "e2a6e84337f7ebbb55f9dc61dcba3a861c0d786ae5a46fa198fd8d6473f5c775",
    },
]


def sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def is_installed(model_dir: pathlib.Path, spec: dict[str, str]) -> bool:
    metadata_path = model_dir / "lianggu-model.json"
    try:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return False
    return (
        (model_dir / "model/model.bin").is_file()
        and (model_dir / "sentencepiece.model").is_file()
        and metadata.get("modelId") == spec["model_id"]
        and metadata.get("source") == spec["source"]
        and metadata.get("target") == spec["target"]
    )


def install_spec(
    models_dir: pathlib.Path,
    cache_dir: pathlib.Path,
    spec: dict[str, str],
) -> None:
    model_dir = models_dir / spec["model_id"]
    if is_installed(model_dir, spec):
        print(f"{spec['model_id']} is already installed.")
        return

    archive_dir = cache_dir / "reply-models"
    archive_dir.mkdir(parents=True, exist_ok=True)
    archive_path = archive_dir / f"{spec['model_id']}.argosmodel"
    if not archive_path.is_file() or sha256(archive_path) != spec["sha256"]:
        print(f"Downloading {spec['model_id']}...")
        urllib.request.urlretrieve(spec["url"], archive_path)
    if sha256(archive_path) != spec["sha256"]:
        raise RuntimeError(f"Checksum verification failed for {spec['model_id']}")

    with tempfile.TemporaryDirectory(prefix="lianggu-reply-model-") as temp_dir:
        temp_root = pathlib.Path(temp_dir)
        with zipfile.ZipFile(archive_path) as archive:
            archive.extract(
                f"{spec['archive_root']}/sentencepiece.model",
                temp_root,
            )
            for member in archive.namelist():
                if member.startswith(f"{spec['archive_root']}/model/") and not member.endswith("/"):
                    archive.extract(member, temp_root)

        extracted_root = temp_root / spec["archive_root"]
        staging_dir = models_dir / f".{spec['model_id']}.installing"
        if staging_dir.exists():
            shutil.rmtree(staging_dir)
        staging_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(extracted_root / "sentencepiece.model", staging_dir)
        shutil.copytree(extracted_root / "model", staging_dir / "model")
        (staging_dir / "lianggu-model.json").write_text(
            json.dumps(
                {
                    "modelId": spec["model_id"],
                    "source": spec["source"],
                    "target": spec["target"],
                    "sha256": spec["sha256"],
                },
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        if model_dir.exists():
            shutil.rmtree(model_dir)
        staging_dir.rename(model_dir)
    print(f"Installed {spec['model_id']}.")


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: install_reply_models.py MODELS_DIR CACHE_DIR")
    models_dir = pathlib.Path(sys.argv[1])
    cache_dir = pathlib.Path(sys.argv[2])
    models_dir.mkdir(parents=True, exist_ok=True)
    for spec in MODEL_SPECS:
        install_spec(models_dir, cache_dir, spec)


if __name__ == "__main__":
    main()
