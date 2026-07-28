/* global browser, messenger */
(function initOfflineMailTranslator(global) {
  const api = global.messenger || global.browser;
  const HOST_NAME = "com.lianggu.mail_translate";
  const MAX_LINES = 80;
  const MAX_LINE_LENGTH = 1200;
  const MAX_TOTAL_LENGTH = 24000;
  const cache = new Map();

  function sanitizeTexts(values) {
    const output = [];
    let totalLength = 0;

    for (const value of Array.isArray(values) ? values : []) {
      if (output.length >= MAX_LINES) break;
      const text = String(value || "").trim().slice(0, MAX_LINE_LENGTH);
      if (!text || totalLength + text.length > MAX_TOTAL_LENGTH) continue;
      output.push(text);
      totalLength += text.length;
    }

    return output;
  }

  async function callNative(payload) {
    if (!api?.runtime?.sendNativeMessage) {
      throw new Error("当前 Thunderbird 不支持本机离线翻译连接。");
    }
    const response = await api.runtime.sendNativeMessage(HOST_NAME, payload);
    if (!response || response.ok !== true) {
      throw new Error(response?.message || "本机离线翻译服务未就绪。");
    }
    return response;
  }

  async function translateBatch(values) {
    const texts = sanitizeTexts(values);
    const missing = [...new Set(texts.filter(text => !cache.has(text)))];

    if (missing.length) {
      const response = await callNative({
        type: "translate",
        source: "en",
        target: "zh",
        texts: missing
      });
      const translations = Array.isArray(response.translations) ? response.translations : [];
      for (let index = 0; index < missing.length; index += 1) {
        cache.set(missing[index], String(translations[index] || "").trim());
      }
    }

    return {
      ok: true,
      engine: "argos-offline",
      translations: texts.map(text => cache.get(text) || "")
    };
  }

  async function health() {
    return callNative({ type: "health" });
  }

  global.OfflineMailTranslator = {
    HOST_NAME,
    health,
    sanitizeTexts,
    translateBatch
  };
})(globalThis);
