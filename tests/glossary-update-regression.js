const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

globalThis.crypto = crypto.webcrypto;
globalThis.browser = {
  runtime: {
    sendNativeMessage: async () => ({
      ok: true,
      state: "CURRENT",
      currentVersion: "1.0.0",
      latestVersion: null,
      previousVersion: null,
      updatedAt: "2026-07-31T00:00:00Z",
      error: null
    })
  },
  storage: {
    local: {
      get: async () => ({}),
      set: async () => undefined
    }
  },
  alarms: {
    clear: async () => true,
    create: () => undefined,
    onAlarm: { addListener: () => undefined }
  }
};

require("../src/glossary-update.js");

(async () => {
  const fixtureRoot = path.join(__dirname, "fixtures");
  const manifestBytes = new Uint8Array(
    fs.readFileSync(path.join(fixtureRoot, "glossary-manifest.json"))
  );
  const signatureBytes = new Uint8Array(
    fs.readFileSync(path.join(fixtureRoot, "glossary-manifest.sig"))
  );
  assert.strictEqual(
    await globalThis.GlossaryUpdate.verifyManifestSignature(
      manifestBytes,
      signatureBytes
    ),
    true,
    "The pinned release key must accept the v1.0.0 manifest."
  );

  const tampered = new Uint8Array(manifestBytes);
  tampered[tampered.length - 2] ^= 1;
  assert.strictEqual(
    await globalThis.GlossaryUpdate.verifyManifestSignature(
      tampered,
      signatureBytes
    ),
    false,
    "A modified manifest must fail RSA-PSS verification."
  );

  const manifest = JSON.parse(Buffer.from(manifestBytes).toString("utf8"));
  const latest = {
    datasetVersion: "1.0.0",
    manifestUrl:
      "https://xffighting.github.io/open-valve-glossary/v1/releases/1.0.0/manifest.json"
  };
  assert.strictEqual(
    globalThis.GlossaryUpdate.validateRegistryUrls(latest, manifest),
    "1.0.0"
  );
  assert.throws(
    () => globalThis.GlossaryUpdate.validateRegistryUrls(
      { ...latest, manifestUrl: "https://example.com/manifest.json" },
      manifest
    ),
    /白名单/u
  );
  assert.strictEqual(
    globalThis.GlossaryUpdate.compareVersions("1.2.0", "1.1.9"),
    1
  );
  assert.strictEqual(
    globalThis.GlossaryUpdate.compareVersions("1.0.0", "1.0.0"),
    0
  );
  assert.strictEqual(
    globalThis.GlossaryUpdate.expectedReleaseAssetUrl(
      "1.0.0",
      "bundle.json.gz"
    ),
    "https://github.com/xffighting/open-valve-glossary/releases/download/v1.0.0/bundle.json.gz"
  );

  const source = fs.readFileSync(
    path.join(__dirname, "..", "src", "glossary-update.js"),
    "utf8"
  );
  assert.ok(
    source.includes("credentials: \"omit\"") &&
    source.includes("referrerPolicy: \"no-referrer\""),
    "Version checks must not attach credentials or a referrer."
  );
  assert.ok(
    !source.includes("messageBody") &&
    !source.includes("emailAddress") &&
    !source.includes("customerRecords"),
    "Version requests must not contain mail or customer fields."
  );

  console.log("glossary update signature regression passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
