#!/usr/bin/env python3
"""Verified Open Valve Glossary activation, rollback, and legacy conversion."""

from __future__ import annotations

import gzip
import hashlib
import io
import json
import os
import pathlib
import re
import shutil
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any, Callable

LANGUAGES = ("zh", "en", "ru", "ar")
STATES = {
    "CURRENT",
    "AVAILABLE",
    "DOWNLOADING",
    "VALIDATING",
    "ACTIVE",
    "ROLLED_BACK",
    "FAILED",
}
SEMVER = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$")
PLACEHOLDER = re.compile(r"\{[A-Za-z][A-Za-z0-9_]*\}")
MAX_COMPRESSED_BYTES = 4 * 1024 * 1024
MAX_BUNDLE_BYTES = 16 * 1024 * 1024
ALLOWED_ARTIFACT_HOSTS = {"xffighting.github.io", "feiver.net"}
ARTIFACT_PATH = re.compile(
    r"^/(?:open-valve-glossary/)?v1/releases/"
    r"(?P<version>[0-9]+\.[0-9]+\.[0-9]+)/bundle\.json\.gz$"
)


class GlossaryUpdateError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def parse_semver(value: Any) -> tuple[int, int, int]:
    match = SEMVER.fullmatch(str(value or ""))
    if not match:
        raise GlossaryUpdateError(
            "VALIDATION_FAILED", f"Invalid semantic version: {value}"
        )
    return tuple(int(item) for item in match.groups())


def normalize_surface(value: Any) -> str:
    return " ".join(str(value or "").split()).casefold()


def validate_artifact_url(url: Any, version: str) -> str:
    parsed = urllib.parse.urlsplit(str(url or ""))
    match = ARTIFACT_PATH.fullmatch(parsed.path)
    if (
        parsed.scheme != "https"
        or parsed.hostname not in ALLOWED_ARTIFACT_HOSTS
        or parsed.username
        or parsed.password
        or parsed.port not in (None, 443)
        or parsed.query
        or parsed.fragment
        or not match
        or match.group("version") != version
    ):
        raise GlossaryUpdateError(
            "VALIDATION_FAILED", "Glossary artifact URL is not allowlisted"
        )
    return urllib.parse.urlunsplit(parsed)


def validate_bundle(bundle: Any, expected_version: str | None = None) -> dict[str, int]:
    if not isinstance(bundle, dict):
        raise GlossaryUpdateError("INVALID_BUNDLE", "Bundle root must be an object")
    required = {
        "schemaVersion",
        "datasetVersion",
        "releasedAt",
        "languages",
        "sources",
        "terms",
        "replyIntents",
        "qaSummary",
    }
    missing = sorted(required - set(bundle))
    if missing:
        raise GlossaryUpdateError(
            "INVALID_BUNDLE", f"Missing bundle fields: {', '.join(missing)}"
        )
    if not str(bundle["schemaVersion"]).startswith("1."):
        raise GlossaryUpdateError(
            "UNSUPPORTED_SCHEMA", f"Unsupported schema: {bundle['schemaVersion']}"
        )
    version = str(bundle["datasetVersion"])
    parse_semver(version)
    if expected_version and version != expected_version:
        raise GlossaryUpdateError(
            "VALIDATION_FAILED", "Manifest and bundle versions do not match"
        )
    if tuple(bundle["languages"]) != LANGUAGES:
        raise GlossaryUpdateError(
            "VALIDATION_FAILED", "Four-language order must be zh, en, ru, ar"
        )
    sources = bundle["sources"]
    if not isinstance(sources, list) or not sources:
        raise GlossaryUpdateError("VALIDATION_FAILED", "Bundle sources are missing")
    source_ids = [str(item.get("id", "")) for item in sources]
    if any(not item for item in source_ids) or len(source_ids) != len(set(source_ids)):
        raise GlossaryUpdateError(
            "VALIDATION_FAILED", "Source IDs must be present and unique"
        )
    known_sources = set(source_ids)

    terms = bundle["terms"]
    if not isinstance(terms, list) or not terms:
        raise GlossaryUpdateError("VALIDATION_FAILED", "Bundle terms are missing")
    term_ids: set[str] = set()
    surfaces: dict[tuple[str, str], list[tuple[str, str]]] = {}
    for term in terms:
        term_id = str(term.get("id", ""))
        if not term_id or term_id in term_ids:
            raise GlossaryUpdateError(
                "VALIDATION_FAILED", f"Term ID is missing or duplicated: {term_id}"
            )
        term_ids.add(term_id)
        if term.get("reviewStatus") != "approved":
            raise GlossaryUpdateError(
                "VALIDATION_FAILED", f"Non-approved term in production: {term_id}"
            )
        group = str(term.get("semanticGroup") or term_id)
        translations = term.get("translations")
        aliases = term.get("aliases")
        if not isinstance(translations, dict) or not isinstance(aliases, dict):
            raise GlossaryUpdateError(
                "VALIDATION_FAILED", f"Term translations are invalid: {term_id}"
            )
        for language in LANGUAGES:
            primary = str(translations.get(language, "")).strip()
            if not primary:
                raise GlossaryUpdateError(
                    "VALIDATION_FAILED",
                    f"Missing {language} translation: {term_id}",
                )
            values = [primary, *aliases.get(language, [])]
            local: set[str] = set()
            for value in values:
                surface = normalize_surface(value)
                if not surface or surface in local:
                    raise GlossaryUpdateError(
                        "VALIDATION_FAILED",
                        f"Blank or duplicate {language} alias: {term_id}",
                    )
                local.add(surface)
                surfaces.setdefault((language, surface), []).append((term_id, group))
        unknown = set(term.get("sourceIds") or []) - known_sources
        if unknown:
            raise GlossaryUpdateError(
                "VALIDATION_FAILED",
                f"Unknown term source IDs: {sorted(unknown)}",
            )
    for (language, surface), owners in surfaces.items():
        if len({group for _, group in owners}) > 1:
            raise GlossaryUpdateError(
                "VALIDATION_FAILED",
                f"Cross-concept alias collision: {language}:{surface}",
            )

    intents = bundle["replyIntents"]
    if not isinstance(intents, list):
        raise GlossaryUpdateError(
            "VALIDATION_FAILED", "Bundle reply intents are invalid"
        )
    intent_ids: set[str] = set()
    for intent in intents:
        intent_id = str(intent.get("intentId", ""))
        if not intent_id or intent_id in intent_ids:
            raise GlossaryUpdateError(
                "VALIDATION_FAILED",
                f"Intent ID is missing or duplicated: {intent_id}",
            )
        intent_ids.add(intent_id)
        if intent.get("reviewStatus") != "approved":
            raise GlossaryUpdateError(
                "VALIDATION_FAILED", f"Non-approved intent: {intent_id}"
            )
        placeholder_sets = []
        for language in LANGUAGES:
            text = str(intent.get("translations", {}).get(language, "")).strip()
            if not text:
                raise GlossaryUpdateError(
                    "VALIDATION_FAILED",
                    f"Missing {language} intent translation: {intent_id}",
                )
            if language == "en" and re.search(r"\bsoft\s+reminder\b", text, re.I):
                raise GlossaryUpdateError(
                    "VALIDATION_FAILED",
                    f"Forbidden outward reminder phrase: {intent_id}",
                )
            placeholder_sets.append(set(PLACEHOLDER.findall(text)))
        if any(items != placeholder_sets[0] for items in placeholder_sets[1:]):
            raise GlossaryUpdateError(
                "VALIDATION_FAILED", f"Intent placeholder mismatch: {intent_id}"
            )
        if set(intent.get("variables") or []) != placeholder_sets[0]:
            raise GlossaryUpdateError(
                "VALIDATION_FAILED",
                f"Intent variables do not match translations: {intent_id}",
            )
        if intent.get("riskLevel") == "high" and not intent.get(
            "requiresHumanReview"
        ):
            raise GlossaryUpdateError(
                "VALIDATION_FAILED",
                f"High-risk intent lacks human review: {intent_id}",
            )
    return {
        "termCount": len(terms),
        "replyIntentCount": len(intents),
        "sourceCount": len(sources),
    }


class AllowlistedRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        parsed = urllib.parse.urlsplit(newurl)
        match = ARTIFACT_PATH.fullmatch(parsed.path)
        if (
            parsed.scheme != "https"
            or parsed.hostname not in ALLOWED_ARTIFACT_HOSTS
            or not match
        ):
            raise GlossaryUpdateError(
                "INTEGRITY_FAILED", "Artifact redirected to an untrusted location"
            )
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def default_downloader(url: str, timeout: float) -> bytes:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "Thunderbird-Open-Valve-Glossary/0.12"},
        method="GET",
    )
    opener = urllib.request.build_opener(AllowlistedRedirectHandler())
    try:
        with opener.open(request, timeout=timeout) as response:
            final_url = response.geturl()
            version = ARTIFACT_PATH.fullmatch(
                urllib.parse.urlsplit(url).path
            ).group("version")
            validate_artifact_url(final_url, version)
            content_length = response.headers.get("Content-Length")
            if content_length and int(content_length) > MAX_COMPRESSED_BYTES:
                raise GlossaryUpdateError(
                    "INTEGRITY_FAILED", "Compressed glossary is too large"
                )
            payload = response.read(MAX_COMPRESSED_BYTES + 1)
    except GlossaryUpdateError:
        raise
    except (OSError, urllib.error.URLError, ValueError) as error:
        raise GlossaryUpdateError(
            "INTEGRITY_FAILED", f"Glossary download failed: {error}"
        ) from error
    if len(payload) > MAX_COMPRESSED_BYTES:
        raise GlossaryUpdateError(
            "INTEGRITY_FAILED", "Compressed glossary is too large"
        )
    return payload


class GlossaryProvider:
    def __init__(
        self,
        data_root: pathlib.Path | None = None,
        embedded_bundle: pathlib.Path | None = None,
        downloader: Callable[[str, float], bytes] | None = None,
        replace_fn: Callable[[Any, Any], None] | None = None,
    ) -> None:
        host_root = pathlib.Path(__file__).resolve().parent
        self.data_root = pathlib.Path(
            data_root
            or os.environ.get("LIANGGU_GLOSSARY_DATA_DIR")
            or host_root / "glossaries"
        )
        self.embedded_bundle = pathlib.Path(
            embedded_bundle or host_root / "open_valve_glossary_bundle.json"
        )
        self.versions_root = self.data_root / "versions"
        self.active_path = self.data_root / "active.json"
        self.status_path = self.data_root / "status.json"
        self.downloader = downloader or default_downloader
        self.replace_fn = replace_fn or os.replace

    def _read_json(self, path: pathlib.Path) -> dict[str, Any]:
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as error:
            raise GlossaryUpdateError(
                "INVALID_BUNDLE", f"Unable to read glossary data: {path.name}"
            ) from error

    def _embedded(self) -> dict[str, Any]:
        bundle = self._read_json(self.embedded_bundle)
        validate_bundle(bundle)
        return bundle

    def _pointer(self) -> dict[str, Any]:
        if not self.active_path.is_file():
            embedded = self._embedded()
            return {
                "currentVersion": embedded["datasetVersion"],
                "previousVersions": [],
                "updatedAt": embedded["releasedAt"],
                "embedded": True,
            }
        pointer = self._read_json(self.active_path)
        parse_semver(pointer.get("currentVersion"))
        previous = pointer.get("previousVersions")
        if not isinstance(previous, list) or any(
            not SEMVER.fullmatch(str(item)) for item in previous
        ):
            raise GlossaryUpdateError(
                "VALIDATION_FAILED", "Glossary activation pointer is invalid"
            )
        return pointer

    def _bundle_path(self, version: str) -> pathlib.Path:
        parse_semver(version)
        return self.versions_root / version / "bundle.json"

    def _version_bundle(self, version: str) -> dict[str, Any]:
        embedded = self._embedded()
        if version == embedded["datasetVersion"] and not self._bundle_path(version).is_file():
            return embedded
        bundle = self._read_json(self._bundle_path(version))
        validate_bundle(bundle, version)
        return bundle

    def _write_status(self, state: str, **values: Any) -> None:
        if state not in STATES:
            raise ValueError(f"Unknown glossary update state: {state}")
        self.data_root.mkdir(parents=True, exist_ok=True)
        payload = {"state": state, "updatedAt": utc_now(), **values}
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=self.data_root,
            prefix=".status-",
            delete=False,
        ) as handle:
            json.dump(payload, handle, ensure_ascii=False, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
            temp_path = pathlib.Path(handle.name)
        self.replace_fn(temp_path, self.status_path)

    def _write_pointer(self, pointer: dict[str, Any]) -> None:
        self.data_root.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=self.data_root,
            prefix=".active-",
            delete=False,
        ) as handle:
            json.dump(pointer, handle, ensure_ascii=False, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
            temp_path = pathlib.Path(handle.name)
        self.replace_fn(temp_path, self.active_path)

    def _response(
        self,
        *,
        ok: bool,
        state: str,
        latest_version: str | None = None,
        error: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        try:
            pointer = self._pointer()
        except GlossaryUpdateError:
            embedded = self._embedded()
            pointer = {
                "currentVersion": embedded["datasetVersion"],
                "previousVersions": [],
                "updatedAt": embedded["releasedAt"],
            }
        previous = pointer.get("previousVersions") or []
        return {
            "ok": ok,
            "state": state,
            "currentVersion": pointer["currentVersion"],
            "latestVersion": latest_version,
            "previousVersion": previous[0] if previous else None,
            "updatedAt": pointer.get("updatedAt"),
            "error": error,
        }

    def status(self, latest_version: str | None = None) -> dict[str, Any]:
        pointer = self._pointer()
        state = "CURRENT"
        if latest_version:
            parse_semver(latest_version)
            if parse_semver(latest_version) > parse_semver(pointer["currentVersion"]):
                state = "AVAILABLE"
        if self.status_path.is_file():
            try:
                recorded = self._read_json(self.status_path)
                if recorded.get("state") in {"ROLLED_BACK", "FAILED"}:
                    state = recorded["state"]
            except GlossaryUpdateError:
                pass
        return self._response(
            ok=state != "FAILED", state=state, latest_version=latest_version
        )

    def load_active_bundle(self) -> dict[str, Any]:
        pointer = self._pointer()
        try:
            return self._version_bundle(pointer["currentVersion"])
        except GlossaryUpdateError as error:
            previous = list(pointer.get("previousVersions") or [])
            for version in previous:
                try:
                    bundle = self._version_bundle(version)
                    fallback_pointer = {
                        "currentVersion": version,
                        "previousVersions": [
                            item
                            for item in [
                                pointer["currentVersion"],
                                *previous,
                            ]
                            if item != version
                        ][:2],
                        "updatedAt": utc_now(),
                        "embedded": version == self._embedded()["datasetVersion"],
                    }
                    self._write_pointer(fallback_pointer)
                    self._write_status(
                        "ROLLED_BACK",
                        currentVersion=version,
                        failedVersion=pointer["currentVersion"],
                        error={"code": error.code, "message": str(error)},
                    )
                    return bundle
                except GlossaryUpdateError:
                    continue
            embedded = self._embedded()
            embedded_pointer = {
                "currentVersion": embedded["datasetVersion"],
                "previousVersions": [pointer["currentVersion"]][:2],
                "updatedAt": utc_now(),
                "embedded": True,
            }
            self._write_pointer(embedded_pointer)
            self._write_status(
                "ROLLED_BACK",
                currentVersion=embedded["datasetVersion"],
                failedVersion=pointer["currentVersion"],
                error={"code": error.code, "message": str(error)},
            )
            return embedded

    def apply(
        self,
        manifest: Any,
        compressed_payload: bytes | None = None,
    ) -> dict[str, Any]:
        latest_version = None
        try:
            if not isinstance(manifest, dict):
                raise GlossaryUpdateError(
                    "INVALID_BUNDLE", "Signed manifest must be an object"
                )
            version = str(manifest.get("datasetVersion") or "")
            latest_version = version
            parse_semver(version)
            pointer = self._pointer()
            current_version = pointer["currentVersion"]
            if parse_semver(version) <= parse_semver(current_version):
                if version == current_version:
                    return self._response(
                        ok=True, state="CURRENT", latest_version=version
                    )
                raise GlossaryUpdateError(
                    "VALIDATION_FAILED", "Glossary downgrade is not allowed"
                )
            compatibility = manifest.get("schemaCompatibility") or {}
            if compatibility.get("maximum") not in {"1.x", "1.*"}:
                raise GlossaryUpdateError(
                    "UNSUPPORTED_SCHEMA", "Manifest schema is incompatible"
                )
            artifact = manifest.get("artifact") or {}
            url = validate_artifact_url(artifact.get("url"), version)
            expected_size = int(artifact.get("size") or 0)
            if expected_size <= 0 or expected_size > MAX_COMPRESSED_BYTES:
                raise GlossaryUpdateError(
                    "INTEGRITY_FAILED", "Manifest artifact size is invalid"
                )
            expected_hash = str(artifact.get("sha256") or "").casefold()
            if not re.fullmatch(r"[0-9a-f]{64}", expected_hash):
                raise GlossaryUpdateError(
                    "INTEGRITY_FAILED", "Manifest SHA-256 is invalid"
                )
            self._write_status(
                "DOWNLOADING",
                currentVersion=current_version,
                latestVersion=version,
            )
            compressed = (
                compressed_payload
                if compressed_payload is not None
                else self.downloader(url, 15.0)
            )
            if not isinstance(compressed, bytes):
                raise GlossaryUpdateError(
                    "INVALID_BUNDLE", "Compressed glossary payload is invalid"
                )
            if len(compressed) != expected_size:
                raise GlossaryUpdateError(
                    "INTEGRITY_FAILED", "Downloaded artifact size does not match"
                )
            actual_hash = hashlib.sha256(compressed).hexdigest()
            if actual_hash != expected_hash:
                raise GlossaryUpdateError(
                    "INTEGRITY_FAILED", "Downloaded artifact hash does not match"
                )
            self._write_status(
                "VALIDATING",
                currentVersion=current_version,
                latestVersion=version,
            )
            try:
                with gzip.GzipFile(fileobj=io.BytesIO(compressed)) as handle:
                    raw = handle.read(MAX_BUNDLE_BYTES + 1)
            except (OSError, EOFError) as error:
                raise GlossaryUpdateError(
                    "INVALID_BUNDLE", "Downloaded glossary gzip is corrupted"
                ) from error
            if len(raw) > MAX_BUNDLE_BYTES:
                raise GlossaryUpdateError(
                    "INTEGRITY_FAILED", "Uncompressed glossary is too large"
                )
            try:
                bundle = json.loads(raw.decode("utf-8"))
            except (UnicodeError, json.JSONDecodeError) as error:
                raise GlossaryUpdateError(
                    "INVALID_BUNDLE", "Downloaded glossary is not UTF-8 JSON"
                ) from error
            validate_bundle(bundle, version)

            self.versions_root.mkdir(parents=True, exist_ok=True)
            final_dir = self.versions_root / version
            if final_dir.exists():
                existing = self._version_bundle(version)
                if existing != bundle:
                    raise GlossaryUpdateError(
                        "INTEGRITY_FAILED",
                        "Existing version content differs from signed release",
                    )
            else:
                temp_dir = pathlib.Path(
                    tempfile.mkdtemp(prefix=".incoming-", dir=self.versions_root)
                )
                try:
                    bundle_path = temp_dir / "bundle.json"
                    with bundle_path.open("wb") as handle:
                        handle.write(raw)
                        handle.flush()
                        os.fsync(handle.fileno())
                    self.replace_fn(temp_dir, final_dir)
                except Exception:
                    if temp_dir.exists():
                        shutil.rmtree(temp_dir)
                    raise

            previous_versions = list(
                dict.fromkeys(
                    [
                        current_version,
                        *(pointer.get("previousVersions") or []),
                    ]
                )
            )[:2]
            new_pointer = {
                "currentVersion": version,
                "previousVersions": previous_versions,
                "updatedAt": utc_now(),
                "embedded": False,
            }
            self._write_pointer(new_pointer)
            self._write_status(
                "ACTIVE",
                currentVersion=version,
                previousVersion=previous_versions[0] if previous_versions else None,
            )
            self._retain_versions(new_pointer)
            return self._response(
                ok=True, state="ACTIVE", latest_version=version
            )
        except GlossaryUpdateError as error:
            try:
                self._write_status(
                    "FAILED",
                    latestVersion=latest_version,
                    error={"code": error.code, "message": str(error)},
                )
            except Exception:
                pass
            return self._response(
                ok=False,
                state="FAILED",
                latest_version=latest_version,
                error={"code": error.code, "message": str(error)},
            )
        except Exception as error:
            wrapped = GlossaryUpdateError(
                "VALIDATION_FAILED", f"Glossary activation failed: {error}"
            )
            try:
                self._write_status(
                    "FAILED",
                    latestVersion=latest_version,
                    error={"code": wrapped.code, "message": str(wrapped)},
                )
            except Exception:
                pass
            return self._response(
                ok=False,
                state="FAILED",
                latest_version=latest_version,
                error={"code": wrapped.code, "message": str(wrapped)},
            )

    def _retain_versions(self, pointer: dict[str, Any]) -> None:
        keep = {
            pointer["currentVersion"],
            *(pointer.get("previousVersions") or [])[:2],
        }
        if not self.versions_root.is_dir():
            return
        versions_root = self.versions_root.resolve()
        for child in self.versions_root.iterdir():
            if (
                not child.is_dir()
                or not SEMVER.fullmatch(child.name)
                or child.name in keep
                or child.resolve().parent != versions_root
            ):
                continue
            shutil.rmtree(child)

    def rollback(self) -> dict[str, Any]:
        try:
            pointer = self._pointer()
            previous = list(pointer.get("previousVersions") or [])
            if not previous:
                raise GlossaryUpdateError(
                    "NOT_FOUND", "No previous glossary version is available"
                )
            target = previous[0]
            self._version_bundle(target)
            new_pointer = {
                "currentVersion": target,
                "previousVersions": [
                    pointer["currentVersion"],
                    *previous[1:],
                ][:2],
                "updatedAt": utc_now(),
                "embedded": target == self._embedded()["datasetVersion"],
            }
            self._write_pointer(new_pointer)
            self._write_status(
                "ROLLED_BACK",
                currentVersion=target,
                previousVersion=pointer["currentVersion"],
            )
            return self._response(ok=True, state="ROLLED_BACK")
        except GlossaryUpdateError as error:
            return self._response(
                ok=False,
                state="FAILED",
                error={"code": error.code, "message": str(error)},
            )


_PROVIDER: GlossaryProvider | None = None


def get_provider() -> GlossaryProvider:
    global _PROVIDER
    if _PROVIDER is None:
        _PROVIDER = GlossaryProvider()
    return _PROVIDER


def bundle_to_legacy_glossary(
    bundle: dict[str, Any], preserve_patterns: list[str]
) -> dict[str, Any]:
    terms = []
    for item in bundle["terms"]:
        translations = item["translations"]
        aliases = item["aliases"]
        terms.append(
            {
                "en": translations["en"],
                "zh": translations["zh"],
                "ru": translations["ru"],
                "ar": translations["ar"],
                "category": item["category"],
                "context": item["context"],
                "enAliases": list(aliases["en"]),
                "zhAliases": list(aliases["zh"]),
                "ruAliases": list(aliases["ru"]),
                "arAliases": list(aliases["ar"]),
            }
        )
    return {
        "name": "open-valve-glossary",
        "version": bundle["datasetVersion"],
        "baseVersion": bundle["datasetVersion"],
        "languages": ["zh-CN", "en", "ru", "ar"],
        "sources": bundle["sources"],
        "terms": terms,
        "multilingualTermCount": len(terms),
        "preserve_patterns": preserve_patterns,
        "provider": "open-valve-glossary",
    }


def bundle_to_legacy_intents(bundle: dict[str, Any]) -> dict[str, Any]:
    intents = []
    for item in bundle["replyIntents"]:
        translations = item["translations"]
        intents.append(
            {
                "intent_id": item["intentId"],
                "scenario": item["scenario"],
                "trigger_zh_patterns": item.get("triggerZhPatterns", []),
                "zh": translations["zh"],
                "en": translations["en"],
                "ru": translations["ru"],
                "ar": translations["ar"],
                "tone": item.get("tone", "professional"),
                "risk_level": item["riskLevel"],
                "variables": item.get("variables", []),
                "do_not_use": item.get("doNotUse", []),
                "source_ids": item.get("sourceIds", []),
                "requires_human_review": item.get("requiresHumanReview", False),
                "allow_pattern_match": False,
            }
        )
    return {
        "name": "open-valve-reply-intents",
        "version": bundle["datasetVersion"],
        "languages": ["zh-CN", "en", "ru", "ar"],
        "sources": bundle["sources"],
        "intents": intents,
    }
