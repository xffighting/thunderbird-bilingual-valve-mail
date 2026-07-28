const assert = require("assert");

const requests = [];
globalThis.browser = {
  runtime: {
    sendNativeMessage: async (_hostName, request) => {
      requests.push(request);
      if (request.source === "ru") {
        return {
          ok: true,
          translations: request.texts.map(() => "阀体材质：WCB。")
        };
      }
      return {
        ok: true,
        translations: request.texts.map(() => "请确认数量。")
      };
    }
  }
};

require("../src/inline-translation-core.js");
require("../src/translation-preferences.js");
require("../src/translation-native.js");

(async () => {
  const result = await globalThis.OfflineMailTranslator.translateBatch(
    [
      "Please confirm the quantity.",
      "Материал корпуса: WCB."
    ],
    [
      {
        en: "Материал корпуса",
        zh: "阀体材质",
        sourceLanguage: "ru",
        enabled: true
      }
    ]
  );

  assert.deepStrictEqual(
    result.translations,
    ["请确认数量。", "阀体材质：WCB。"],
    "mixed English and Russian input should preserve source order"
  );
  assert.deepStrictEqual(
    requests.map(request => ({
      type: request.type,
      source: request.source,
      target: request.target,
      texts: request.texts
    })),
    [
      {
        type: "translate",
        source: "en",
        target: "zh",
        texts: ["Please confirm the quantity."]
      },
      {
        type: "translate",
        source: "ru",
        target: "zh",
        texts: ["Материал корпуса: WCB."]
      }
    ],
    "English and Russian lines should be sent only to their matching offline model route"
  );
  assert.strictEqual(
    requests[1].customTerms[0].sourceLanguage,
    "ru",
    "Russian correction terminology should reach the native host"
  );

  console.log("translation native regression passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
