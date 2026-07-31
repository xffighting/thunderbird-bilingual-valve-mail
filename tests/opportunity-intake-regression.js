const assert = require("assert");
const crypto = require("crypto");

const posted = [];
const messageListeners = [];
const disconnectListeners = [];
const port = {
  onMessage: {
    addListener(listener) {
      messageListeners.push(listener);
    }
  },
  onDisconnect: {
    addListener(listener) {
      disconnectListeners.push(listener);
    }
  },
  postMessage(message) {
    posted.push(message);
    queueMicrotask(() => {
      let response;
      if (message.type === "begin_email") {
        response = { ok: true, type: "email_started", sessionId: "s_test" };
      } else if (message.type === "write_chunk") {
        response = { ok: true, type: "chunk_written" };
      } else if (message.type === "commit_email") {
        response = message.workflow === "customer_intelligence"
          ? {
              ok: true,
              type: "customer_intelligence_result",
              result: { status: "ready", version: { number: 2 } }
            }
          : {
              ok: true,
              type: "intake_result",
              result: { status: "completed", dingtalk_opportunity_number: "SJ-SYNTHETIC" }
            };
      } else {
        response = { ok: true, type: "email_aborted" };
      }
      for (const listener of messageListeners) listener({ ...response, nonce: message.nonce });
    });
  }
};

globalThis.crypto = crypto.webcrypto;
globalThis.browser = {
  runtime: {
    connectNative(hostName) {
      assert.strictEqual(hostName, "com.lianggu.thunderbird_intake");
      return port;
    },
    lastError: null
  }
};

require("../src/opportunity-intake-native.js");

(async () => {
  const source = new Uint8Array(Buffer.from("synthetic Thunderbird EML", "utf8"));
  const response = await globalThis.LiangguOpportunityIntake.submitEmail(source, "apply");

  assert.strictEqual(response.result.status, "completed");
  assert.deepStrictEqual(
    posted.map(item => item.type),
    ["begin_email", "write_chunk", "commit_email"],
    "The selected EML should be streamed through the fixed local host protocol."
  );
  assert.strictEqual(posted[0].size, source.length);
  assert.strictEqual(posted[2].mode, "apply");
  assert.strictEqual(
    posted[2].sha256,
    crypto.createHash("sha256").update(source).digest("hex"),
    "The native host must receive an end-to-end SHA-256 for integrity validation."
  );
  assert.strictEqual(disconnectListeners.length, 1);

  posted.length = 0;
  const research = await globalThis.LiangguOpportunityIntake.analyzeCustomer(source, {
    force: true,
    autoUpdate: true
  });
  assert.strictEqual(research.result.version.number, 2);
  assert.strictEqual(posted[2].workflow, "customer_intelligence");
  assert.strictEqual(posted[2].mode, "refresh");
  assert.strictEqual(posted[2].autoUpdate, true);

  console.log("opportunity intake native regression passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
