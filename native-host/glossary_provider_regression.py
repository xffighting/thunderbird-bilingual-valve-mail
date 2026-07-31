#!/usr/bin/env python3
"""Exercise update, integrity, downgrade, atomicity, and rollback behavior."""

from __future__ import annotations

import copy
import gzip
import hashlib
import json
import os
import pathlib
import tempfile

from glossary_provider import GlossaryProvider

ROOT = pathlib.Path(__file__).resolve().parent
EMBEDDED = ROOT / "open_valve_glossary_bundle.json"


def release(version: str, *, schema: str = "1.0.0", corrupt: bool = False):
    bundle = json.loads(EMBEDDED.read_text(encoding="utf-8"))
    bundle["datasetVersion"] = version
    bundle["schemaVersion"] = schema
    raw = json.dumps(
        bundle,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    compressed = b"not-a-gzip" if corrupt else gzip.compress(raw, mtime=0)
    manifest = {
        "datasetVersion": version,
        "schemaCompatibility": {"minimum": "1.0.0", "maximum": "1.x"},
        "artifact": {
            "url": (
                "https://xffighting.github.io/open-valve-glossary/"
                f"v1/releases/{version}/bundle.json.gz"
            ),
            "size": len(compressed),
            "sha256": hashlib.sha256(compressed).hexdigest(),
        },
    }
    return manifest, compressed


def provider_for(root: pathlib.Path, payload: bytes, **kwargs):
    requests = []

    def downloader(url: str, timeout: float):
        requests.append({"url": url, "timeout": timeout})
        return payload

    return (
        GlossaryProvider(
            data_root=root,
            embedded_bundle=EMBEDDED,
            downloader=kwargs.get("downloader", downloader),
            replace_fn=kwargs.get("replace_fn", os.replace),
        ),
        requests,
    )


def assert_uniform(result):
    assert set(result) == {
        "ok",
        "state",
        "currentVersion",
        "latestVersion",
        "previousVersion",
        "updatedAt",
        "error",
    }, result


def main() -> None:
    with tempfile.TemporaryDirectory() as temporary:
        root = pathlib.Path(temporary)
        manifest, payload = release("1.2.0")
        provider, requests = provider_for(root, payload)
        result = provider.apply(manifest)
        assert_uniform(result)
        assert result["ok"] and result["state"] == "ACTIVE", result
        assert result["currentVersion"] == "1.2.0", result
        assert requests == [
            {
                "url": manifest["artifact"]["url"],
                "timeout": 15.0,
            }
        ], requests
        assert provider.load_active_bundle()["datasetVersion"] == "1.2.0"
        rollback = provider.rollback()
        assert_uniform(rollback)
        assert rollback["state"] == "ROLLED_BACK", rollback
        assert rollback["currentVersion"] == "1.1.0", rollback

    for label, change in (
        ("hash", lambda manifest: manifest["artifact"].update({"sha256": "0" * 64})),
        (
            "schema",
            lambda manifest: manifest["schemaCompatibility"].update(
                {"maximum": "2.x"}
            ),
        ),
    ):
        with tempfile.TemporaryDirectory() as temporary:
            manifest, payload = release("1.2.0")
            change(manifest)
            provider, _ = provider_for(pathlib.Path(temporary), payload)
            result = provider.apply(manifest)
            assert_uniform(result)
            assert not result["ok"] and result["state"] == "FAILED", (label, result)
            assert result["currentVersion"] == "1.1.0", (label, result)

    with tempfile.TemporaryDirectory() as temporary:
        manifest, payload = release("1.2.0", corrupt=True)
        provider, _ = provider_for(pathlib.Path(temporary), payload)
        result = provider.apply(manifest)
        assert not result["ok"] and result["error"]["code"] == "INVALID_BUNDLE", result

    with tempfile.TemporaryDirectory() as temporary:
        manifest, payload = release("1.2.0", schema="2.0.0")
        provider, _ = provider_for(pathlib.Path(temporary), payload)
        result = provider.apply(manifest)
        assert not result["ok"] and result["error"]["code"] == "UNSUPPORTED_SCHEMA", result

    for failure in (OSError("offline"), TimeoutError("timeout")):
        with tempfile.TemporaryDirectory() as temporary:
            manifest, payload = release("1.2.0")

            def failing_downloader(_url, _timeout, failure=failure):
                raise failure

            provider, _ = provider_for(
                pathlib.Path(temporary),
                payload,
                downloader=failing_downloader,
            )
            result = provider.apply(manifest)
            assert not result["ok"] and result["currentVersion"] == "1.1.0", result

    with tempfile.TemporaryDirectory() as temporary:
        root = pathlib.Path(temporary)
        manifest, payload = release("1.2.0")

        def fail_active_pointer(source, destination):
            if pathlib.Path(destination).name == "active.json":
                raise OSError("simulated atomic switch failure")
            os.replace(source, destination)

        provider, _ = provider_for(
            root,
            payload,
            replace_fn=fail_active_pointer,
        )
        result = provider.apply(manifest)
        assert not result["ok"] and result["currentVersion"] == "1.1.0", result

    with tempfile.TemporaryDirectory() as temporary:
        root = pathlib.Path(temporary)
        manifest, payload = release("1.2.0")
        provider, _ = provider_for(root, payload)
        assert provider.apply(manifest)["ok"]
        (root / "versions/1.2.0/bundle.json").write_text(
            "{corrupted",
            encoding="utf-8",
        )
        recovered = provider.load_active_bundle()
        assert recovered["datasetVersion"] == "1.1.0", recovered["datasetVersion"]
        status = provider.status()
        assert status["state"] == "ROLLED_BACK", status

    with tempfile.TemporaryDirectory() as temporary:
        root = pathlib.Path(temporary)
        first_manifest, first_payload = release("1.2.0")
        provider, _ = provider_for(root, first_payload)
        assert provider.apply(first_manifest)["ok"]
        downgrade_manifest, downgrade_payload = release("0.9.0")
        provider.downloader = lambda _url, _timeout: downgrade_payload
        downgrade = provider.apply(downgrade_manifest)
        assert not downgrade["ok"]
        assert downgrade["error"]["message"] == "Glossary downgrade is not allowed"
        assert downgrade["currentVersion"] == "1.2.0"

    with tempfile.TemporaryDirectory() as temporary:
        root = pathlib.Path(temporary)
        provider = None
        for version in ("1.2.0", "1.3.0", "1.4.0", "1.5.0"):
            manifest, payload = release(version)
            if provider is None:
                provider, _ = provider_for(root, payload)
            else:
                provider.downloader = lambda _url, _timeout, data=payload: data
            assert provider.apply(manifest)["ok"], version
        kept = sorted(
            path.name
            for path in (root / "versions").iterdir()
            if path.is_dir() and not path.name.startswith(".")
        )
        assert kept == ["1.3.0", "1.4.0", "1.5.0"], kept

    print("glossary provider regression passed")


if __name__ == "__main__":
    main()
