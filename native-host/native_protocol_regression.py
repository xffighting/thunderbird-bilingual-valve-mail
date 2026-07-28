#!/usr/bin/env python3
"""Protocol-level regression without launching Thunderbird."""

import json
import os
import pathlib
import struct
import subprocess


def main() -> None:
    app_dir = pathlib.Path.home() / "Library/Application Support/Lianggu/MailTranslator"
    launcher = app_dir / "host-launcher.sh"
    if not launcher.exists():
        raise SystemExit("native host is not installed")

    request = json.dumps({"type": "health"}).encode("utf-8")
    framed = struct.pack("<I", len(request)) + request
    process = subprocess.run(
        [str(launcher)],
        input=framed,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
        env=os.environ.copy(),
        timeout=60,
    )
    if len(process.stdout) < 4:
        raise AssertionError(process.stderr.decode("utf-8", errors="replace"))

    response_length = struct.unpack("<I", process.stdout[:4])[0]
    response = json.loads(process.stdout[4 : 4 + response_length].decode("utf-8"))
    assert response.get("ok") is True, response
    assert response.get("engine") == "argos-offline", response
    assert response.get("terminology") == "lianggu-valve-glossary", response
    assert int(response.get("termCount", 0)) >= 35, response
    print("native protocol regression passed")


if __name__ == "__main__":
    main()
