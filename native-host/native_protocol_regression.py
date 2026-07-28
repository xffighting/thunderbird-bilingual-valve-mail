#!/usr/bin/env python3
"""Protocol-level regression without launching Thunderbird."""

import json
import os
import pathlib
import struct
import subprocess


def send_request(launcher: pathlib.Path, payload: dict) -> dict:
    request = json.dumps(payload).encode("utf-8")
    framed = struct.pack("<I", len(request)) + request
    process = subprocess.run(
        [str(launcher)],
        input=framed,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
        env=os.environ.copy(),
        timeout=120,
    )
    if len(process.stdout) < 4:
        raise AssertionError(process.stderr.decode("utf-8", errors="replace"))
    response_length = struct.unpack("<I", process.stdout[:4])[0]
    return json.loads(process.stdout[4 : 4 + response_length].decode("utf-8"))


def main() -> None:
    app_dir = pathlib.Path.home() / "Library/Application Support/Lianggu/MailTranslator"
    launcher = app_dir / "host-launcher.sh"
    if not launcher.exists():
        raise SystemExit("native host is not installed")

    response = send_request(launcher, {"type": "health"})
    assert response.get("ok") is True, response
    assert response.get("engine") == "argos-offline", response
    assert response.get("terminology") == "lianggu-valve-glossary", response
    assert int(response.get("termCount", 0)) >= 150, response
    assert response.get("modelId"), response
    assert "ru" in response.get("sources", []), response
    assert response.get("russianModelId") == "translate-ru_en-1_0", response

    translated = send_request(
        launcher,
        {
            "type": "translate",
            "source": "en",
            "target": "zh",
            "texts": ["Please confirm the pressure holding time."],
            "customTerms": [
                {
                    "en": "pressure holding time",
                    "zh": "保压时间",
                    "enabled": True,
                }
            ],
        },
    )
    assert "保压时间" in translated.get("translations", [""])[0], translated
    assert translated.get("customTermCount") == 1, translated

    russian = send_request(
        launcher,
        {
            "type": "translate",
            "source": "ru",
            "target": "zh",
            "texts": [
                "Просим предоставить цену на шаровой кран DN50 PN16.",
                "Материал корпуса: WCB.",
            ],
            "customTerms": [
                {
                    "en": "Материал корпуса",
                    "zh": "阀体材质",
                    "sourceLanguage": "ru",
                    "enabled": True,
                }
            ],
        },
    )
    assert russian.get("ok") is True, russian
    assert russian.get("source") == "ru", russian
    assert "球阀" in russian.get("translations", [""])[0], russian
    assert "DN50" in russian.get("translations", [""])[0], russian
    assert "PN16" in russian.get("translations", [""])[0], russian
    assert "阀体材质" in russian.get("translations", ["", ""])[1], russian
    assert "WCB" in russian.get("translations", ["", ""])[1], russian

    benchmark = send_request(launcher, {"type": "benchmark", "customTerms": []})
    assert benchmark.get("ok") is True, benchmark
    assert int(benchmark.get("score", 0)) >= 70, benchmark
    assert benchmark.get("selectedModel"), benchmark
    assert int(benchmark.get("candidateCount", 0)) >= 1, benchmark
    print("native protocol regression passed")


if __name__ == "__main__":
    main()
