/* global browser, messenger, OfflineMailTranslator */
(function initGlossaryUpdate(global) {
  const api = global.messenger || global.browser;
  const BASE_URL = "https://xffighting.github.io/open-valve-glossary";
  const LATEST_URL = `${BASE_URL}/v1/latest.json`;
  const GITHUB_RELEASES_API =
    "https://api.github.com/repos/xffighting/open-valve-glossary/releases/latest";
  const PUBLIC_KEY_SPKI_BASE64 =
    "MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEA077ZO7+o3r/DlHQvCD1KXDOv6GQc5NVpMHE1qxbD8z5eC7dIScmHiib/XIYr+Hxd5M49dY9eqUTJFQBXDsC03KCCTycNxVQkIWLBe2abGfnecN3mI6Z7Jf3PDJPUF2o5pjakB95knB/40eG8Lx6buAU01/DJR2wrNZWBeAXQ9Km2rDnEWVQqJZGBA7/ScEwopjzxD64yK84p6QPK22Gy2ojSHEZYY0OXkrurhGtRhOHM/RFtfGtVY2jQ3AYVA1UHwTvsZZq6izjXjte2aVAqisDz/sHgcfhkIbrsNRZKBn4Iaoh5d16GT71Em6CKtE8pAahtjQgoqUdBDgxAQA/yFTiqCuGM3VTAufIrVayPj/JiZt6IKyCdC83oD9zcKpeoiZDmncONVO/B3D+p48Sd3DQh3TDI27KgnPLug3CP7KxLFvN/kcXsVk75DCAmpNON7H3GymvKz1VOlx/OAWKnr4IeCm9Mwh+/cMTyi9sQ1mTF52SnpFkWE7cpeUR70pZzAgMBAAE=";
  const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
  const MAX_JITTER_MS = 30 * 60 * 1000;
  const FETCH_TIMEOUT_MS = 30_000;
  const MAX_MANIFEST_BYTES = 128 * 1024;
  const MAX_SIGNATURE_BYTES = 1024;
  const MAX_RELEASE_API_BYTES = 256 * 1024;
  const MAX_BUNDLE_DOWNLOAD_BYTES = 700 * 1024;
  const ALARM_NAME = "open-valve-glossary-update";
  const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;

  function bytesFromBase64(value) {
    const binary = global.atob
      ? global.atob(value)
      : Buffer.from(value, "base64").toString("binary");
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  }

  function parseVersion(value) {
    const match = VERSION_PATTERN.exec(String(value || ""));
    if (!match) throw new Error(`无效的词库版本：${value || "空"}`);
    return match.slice(1).map(Number);
  }

  function compareVersions(left, right) {
    const leftParts = parseVersion(left);
    const rightParts = parseVersion(right);
    for (let index = 0; index < 3; index += 1) {
      if (leftParts[index] !== rightParts[index]) {
        return leftParts[index] > rightParts[index] ? 1 : -1;
      }
    }
    return 0;
  }

  function expectedManifestUrl(version) {
    parseVersion(version);
    return `${BASE_URL}/v1/releases/${version}/manifest.json`;
  }

  function expectedSignatureUrl(version) {
    parseVersion(version);
    return `${BASE_URL}/v1/releases/${version}/manifest.sig`;
  }

  function expectedArtifactUrl(version) {
    parseVersion(version);
    return `${BASE_URL}/v1/releases/${version}/bundle.json.gz`;
  }

  function expectedReleaseAssetUrl(version, name) {
    parseVersion(version);
    if (!["manifest.json", "manifest.sig", "bundle.json.gz"].includes(name)) {
      throw new Error("词库发布资源名称不受支持。");
    }
    return (
      "https://github.com/xffighting/open-valve-glossary/" +
      `releases/download/v${version}/${name}`
    );
  }

  function validateRegistryUrls(latest, manifest) {
    const version = String(latest?.datasetVersion || "");
    parseVersion(version);
    if (latest.manifestUrl !== expectedManifestUrl(version)) {
      throw new Error("词库清单地址不在固定白名单中。");
    }
    if (manifest?.datasetVersion !== version) {
      throw new Error("最新版本与签名清单版本不一致。");
    }
    if (manifest?.artifact?.url !== expectedArtifactUrl(version)) {
      throw new Error("词库下载地址不在固定白名单中。");
    }
    if (manifest?.signature?.url !== expectedSignatureUrl(version)) {
      throw new Error("词库签名地址不在固定白名单中。");
    }
    if (manifest?.signature?.algorithm !== "RSA-PSS-SHA256") {
      throw new Error("词库签名算法不受支持。");
    }
    if (Number(manifest?.signature?.saltLength) !== 32) {
      throw new Error("词库签名盐长度不受支持。");
    }
    return version;
  }

  async function fetchBytes(url, maximumBytes) {
    const controller = new AbortController();
    const timeout = global.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await global.fetch(url, {
        method: "GET",
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const declared = Number(response.headers.get("Content-Length") || 0);
      if (declared > maximumBytes) throw new Error("响应超过大小限制");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > maximumBytes) throw new Error("响应超过大小限制");
      return bytes;
    } finally {
      global.clearTimeout(timeout);
    }
  }

  async function fetchJson(url, maximumBytes) {
    const bytes = await fetchBytes(url, maximumBytes);
    try {
      return {
        bytes,
        value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
      };
    } catch (error) {
      throw new Error(`词库版本信息不是有效 JSON：${error.message}`);
    }
  }

  async function verifyManifestSignature(manifestBytes, signatureBytes) {
    if (!global.crypto?.subtle) {
      throw new Error("当前 Thunderbird 不支持词库签名验证。");
    }
    const publicKey = await global.crypto.subtle.importKey(
      "spki",
      bytesFromBase64(PUBLIC_KEY_SPKI_BASE64),
      { name: "RSA-PSS", hash: "SHA-256" },
      false,
      ["verify"]
    );
    return global.crypto.subtle.verify(
      { name: "RSA-PSS", saltLength: 32 },
      publicKey,
      signatureBytes,
      manifestBytes
    );
  }

  function bytesToBase64(bytes) {
    if (typeof Buffer !== "undefined") {
      return Buffer.from(bytes).toString("base64");
    }
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 16_384) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 16_384));
    }
    return global.btoa(binary);
  }

  async function sha256Hex(bytes) {
    const digest = await global.crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)]
      .map(value => value.toString(16).padStart(2, "0"))
      .join("");
  }

  async function githubReleaseDescriptor() {
    const release = (await fetchJson(
      GITHUB_RELEASES_API,
      MAX_RELEASE_API_BYTES
    )).value;
    const version = String(release?.tag_name || "").replace(/^v/u, "");
    parseVersion(version);
    if (release.tag_name !== `v${version}`) {
      throw new Error("GitHub Release 标签不是规范语义版本。");
    }
    const byName = new Map(
      (Array.isArray(release.assets) ? release.assets : [])
        .map(asset => [asset?.name, asset?.browser_download_url])
    );
    const descriptor = {
      channel: "github-release",
      version,
      manifestUrl: byName.get("manifest.json"),
      signatureUrl: byName.get("manifest.sig"),
      bundleUrl: byName.get("bundle.json.gz")
    };
    for (const [name, url] of [
      ["manifest.json", descriptor.manifestUrl],
      ["manifest.sig", descriptor.signatureUrl],
      ["bundle.json.gz", descriptor.bundleUrl]
    ]) {
      if (url !== expectedReleaseAssetUrl(version, name)) {
        throw new Error(`GitHub Release 缺少受信任资源：${name}`);
      }
    }
    return descriptor;
  }

  async function pagesDescriptor() {
    const latest = (await fetchJson(LATEST_URL, MAX_MANIFEST_BYTES)).value;
    const version = String(latest?.datasetVersion || "");
    if (latest.manifestUrl !== expectedManifestUrl(version)) {
      throw new Error("最新版本返回了非白名单清单地址。");
    }
    return {
      channel: "github-pages",
      version,
      manifestUrl: latest.manifestUrl,
      signatureUrl: expectedSignatureUrl(version),
      bundleUrl: expectedArtifactUrl(version),
      latest
    };
  }

  async function releaseDescriptor() {
    try {
      return await githubReleaseDescriptor();
    } catch {
      return pagesDescriptor();
    }
  }

  async function nativeRequest(payload) {
    if (global.OfflineMailTranslator?.callNative) {
      return global.OfflineMailTranslator.callNative(payload);
    }
    const response = await api.runtime.sendNativeMessage(
      "com.lianggu.mail_translate",
      payload
    );
    if (!response) throw new Error("本机词库服务没有返回状态。");
    return response;
  }

  async function status(latestVersion = null) {
    return nativeRequest({
      type: "glossary_update_status",
      ...(latestVersion ? { latestVersion } : {})
    });
  }

  async function readOptions() {
    const stored = await api.storage.local.get(["options", "glossaryUpdateCheck"]);
    return {
      options: stored.options || {},
      check: stored.glossaryUpdateCheck || {}
    };
  }

  async function recordCheck(values) {
    const stored = await api.storage.local.get("glossaryUpdateCheck");
    await api.storage.local.set({
      glossaryUpdateCheck: {
        ...(stored.glossaryUpdateCheck || {}),
        checkedAt: Date.now(),
        ...values
      }
    });
  }

  async function check({ force = false, apply = true } = {}) {
    const stored = await readOptions();
    if (stored.options.glossaryAutoUpdateEnabled === false && !force) {
      return status();
    }
    const elapsed = Date.now() - Number(stored.check.checkedAt || 0);
    if (!force && elapsed < CHECK_INTERVAL_MS) {
      return status(stored.check.latestVersion || null);
    }
    try {
      const descriptor = await releaseDescriptor();
      const version = descriptor.version;
      const manifestResponse = await fetchJson(
        descriptor.manifestUrl,
        MAX_MANIFEST_BYTES
      );
      const manifest = manifestResponse.value;
      validateRegistryUrls(
        {
          datasetVersion: version,
          manifestUrl: expectedManifestUrl(version)
        },
        manifest
      );
      const signatureBytes = await fetchBytes(
        descriptor.signatureUrl,
        MAX_SIGNATURE_BYTES
      );
      const signatureValid = await verifyManifestSignature(
        manifestResponse.bytes,
        signatureBytes
      );
      if (!signatureValid) throw new Error("词库发布签名验证失败。");
      await recordCheck({ latestVersion: version, error: null });
      const current = await status(version);
      if (!apply || compareVersions(version, current.currentVersion) <= 0) {
        return current;
      }
      const bundleBytes = await fetchBytes(
        descriptor.bundleUrl,
        MAX_BUNDLE_DOWNLOAD_BYTES
      );
      if (
        bundleBytes.byteLength !== Number(manifest.artifact.size) ||
        await sha256Hex(bundleBytes) !== String(manifest.artifact.sha256).toLowerCase()
      ) {
        throw new Error("词库数据包的大小或 SHA-256 与签名清单不一致。");
      }
      return nativeRequest({
        type: "glossary_update_apply",
        manifest,
        bundleBase64: bytesToBase64(bundleBytes)
      });
    } catch (error) {
      await recordCheck({
        error: {
          code: "UPDATE_CHECK_FAILED",
          message: String(error?.message || error)
        }
      });
      const current = await status().catch(() => ({
        currentVersion: null,
        previousVersion: null,
        updatedAt: null
      }));
      return {
        ok: false,
        state: "FAILED",
        currentVersion: current.currentVersion,
        latestVersion: null,
        previousVersion: current.previousVersion,
        updatedAt: current.updatedAt,
        error: {
          code: "UPDATE_CHECK_FAILED",
          message: String(error?.message || error)
        }
      };
    }
  }

  async function rollback() {
    return nativeRequest({ type: "glossary_update_rollback" });
  }

  async function configure(enabled) {
    if (!api.alarms) return;
    await api.alarms.clear(ALARM_NAME);
    if (enabled === false) return;
    const stored = await readOptions();
    const checkedAt = Number(stored.check.checkedAt || 0);
    const dueAt = Math.max(Date.now(), checkedAt + CHECK_INTERVAL_MS);
    const jitter = Math.floor(Math.random() * MAX_JITTER_MS);
    api.alarms.create(ALARM_NAME, {
      when: dueAt + jitter,
      periodInMinutes: CHECK_INTERVAL_MS / 60_000
    });
  }

  async function start() {
    if (!api?.alarms) return;
    api.alarms.onAlarm.addListener(alarm => {
      if (alarm?.name !== ALARM_NAME) return;
      check().catch(() => undefined);
    });
    const stored = await readOptions();
    await configure(stored.options.glossaryAutoUpdateEnabled !== false);
  }

  global.GlossaryUpdate = {
    BASE_URL,
    LATEST_URL,
    PUBLIC_KEY_SPKI_BASE64,
    check,
    compareVersions,
    configure,
    expectedArtifactUrl,
    expectedManifestUrl,
    expectedReleaseAssetUrl,
    expectedSignatureUrl,
    githubReleaseDescriptor,
    rollback,
    start,
    status,
    validateRegistryUrls,
    verifyManifestSignature
  };
})(globalThis);
