const assert = require("assert");
const core = require("../src/compose-assistant-core.js");

const pendingSuggestions = new Map();
const createdWindows = [];
const checkedWindows = [];
const removedWindows = [];
const refreshedSessions = [];
let runtimeListener = null;

function suggestionResponse(source, requiresHumanReview = false) {
  return {
    ok: true,
    engine: "argos-offline",
    requiresHumanReview,
    highRiskIntentIds: requiresHumanReview ? ["payment_due_by_date"] : [],
    candidates: core.LANGUAGE_ORDER.map(code => ({
      code,
      blocks: [
        { type: "greeting", text: `${code}-hello` },
        { type: "paragraph", text: `${code}-${source}` },
        { type: "closing", text: `${code}-close` }
      ]
    }))
  };
}

global.ComposeAssistantCore = core;
global.TranslationPreferences = {
  normalizeCustomTerms(values) {
    return values;
  }
};
global.OfflineMailTranslator = {
  composeSuggestions(source) {
    return new Promise(resolve => {
      pendingSuggestions.set(source, resolve);
    });
  }
};
global.browser = {
  storage: {
    local: {
      async get() {
        return { options: { composeAssistantEnabled: true, customTerms: [] } };
      }
    }
  },
  compose: {
    async getComposeDetails() {
      return { isPlainText: false };
    }
  },
  runtime: {
    getURL(value) {
      return `moz-extension://lianggu/${value}`;
    },
    async sendMessage(message) {
      refreshedSessions.push(message);
      return { ok: true };
    },
    onMessage: {
      addListener(listener) {
        runtimeListener = listener;
      }
    }
  },
  scripting: {
    compose: {
      async getRegisteredScripts() {
        return [{ id: "lianggu-compose-assistant-v1" }];
      },
      async registerScripts() {
        throw new Error("The compose script should already be registered in this regression.");
      }
    }
  },
  tabs: {
    async sendMessage() {
      return { ok: true };
    }
  },
  windows: {
    async get(windowId) {
      checkedWindows.push(windowId);
      if (windowId === 9) {
        return { id: 9, left: -1920, top: -144, width: 1920, height: 1050 };
      }
      return { id: windowId };
    },
    async create(options) {
      createdWindows.push(options);
      return { id: 501 };
    },
    async update() {
      throw new Error("Live refresh must not focus or update the assistant window.");
    },
    async remove(windowId) {
      removedWindows.push(windowId);
    }
  }
};

require("../src/compose-assistant-background.js");

(async () => {
  assert.strictEqual(typeof runtimeListener, "function");
  const sender = { tab: { id: 42, windowId: 9 } };
  const firstSource = "球阀报价已经准备完成，请查收附件。";
  const secondSource = "球阀报价已经修订完成，请查收附件。";

  const firstRequest = runtimeListener({
    type: "previewComposeDraft",
    source: firstSource,
    sourceFingerprint: core.fingerprint(firstSource)
  }, sender);
  const secondRequest = runtimeListener({
    type: "previewComposeDraft",
    source: secondSource,
    sourceFingerprint: core.fingerprint(secondSource)
  }, sender);

  await new Promise(resolve => setImmediate(resolve));
  pendingSuggestions.get(secondSource)(suggestionResponse(secondSource));
  const secondResult = await secondRequest;
  assert.strictEqual(secondResult.ok, true);

  pendingSuggestions.get(firstSource)(suggestionResponse(firstSource));
  const firstResult = await firstRequest;
  assert.deepStrictEqual(firstResult, {
    ok: false,
    ignored: true,
    reason: "superseded"
  });

  assert.strictEqual(createdWindows.length, 1);
  assert.strictEqual(createdWindows[0].focused, false);
  assert.strictEqual(createdWindows[0].left, -540);
  assert.strictEqual(createdWindows[0].top, -110);

  const sessionResponse = await runtimeListener({
    type: "getComposeSuggestionSession",
    sessionId: "compose-42"
  }, {});
  assert.strictEqual(sessionResponse.ok, true);
  assert.strictEqual(sessionResponse.session.source, secondSource);

  const thirdSource = "球阀报价已经再次修订，请确认附件。";
  const pendingResult = await runtimeListener({
    type: "composeDraftPreviewPending",
    sourceFingerprint: core.fingerprint(thirdSource)
  }, sender);
  assert.strictEqual(pendingResult.ok, true);
  assert.deepStrictEqual(refreshedSessions.at(-1), {
    type: "composeSuggestionSessionPending",
    sessionId: "compose-42",
    sourceFingerprint: core.fingerprint(thirdSource)
  });
  const thirdRequest = runtimeListener({
    type: "previewComposeDraft",
    source: thirdSource,
    sourceFingerprint: core.fingerprint(thirdSource)
  }, sender);
  await new Promise(resolve => setImmediate(resolve));
  pendingSuggestions.get(thirdSource)(suggestionResponse(thirdSource, true));
  const thirdResult = await thirdRequest;
  assert.strictEqual(thirdResult.ok, true);
  assert.ok(checkedWindows.includes(501));
  assert.deepStrictEqual(refreshedSessions.at(-1), {
    type: "composeSuggestionSessionUpdated",
    sessionId: "compose-42"
  });
  const reviewBlocked = await runtimeListener({
    type: "applyComposeSuggestion",
    sessionId: "compose-42",
    language: "en",
    humanReviewConfirmed: false
  }, {});
  assert.strictEqual(reviewBlocked.ok, false);
  assert.strictEqual(reviewBlocked.reviewRequired, true);

  const cleared = await runtimeListener({ type: "clearComposeDraftPreview" }, sender);
  assert.strictEqual(cleared.ok, true);
  assert.deepStrictEqual(removedWindows, [501]);
  const clearedSession = await runtimeListener({
    type: "getComposeSuggestionSession",
    sessionId: "compose-42"
  }, {});
  assert.strictEqual(clearedSession.ok, false);

  console.log("compose-assistant-background-regression: ok");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
