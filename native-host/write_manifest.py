#!/usr/bin/env python3
"""Write the per-user Thunderbird native-messaging manifest."""

import json
import pathlib
import sys


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: write_manifest.py MANIFEST_PATH HOST_LAUNCHER")

    manifest_path = pathlib.Path(sys.argv[1])
    launcher_path = pathlib.Path(sys.argv[2]).resolve()
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest = {
        "name": "com.lianggu.mail_translate",
        "description": "Lianggu offline English, Russian, and Arabic to Chinese mail translator",
        "path": str(launcher_path),
        "type": "stdio",
        "allowed_extensions": ["game-mail-summary@example.com"],
    }
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
