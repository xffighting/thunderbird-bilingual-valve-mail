/* global browser, messenger, ComposeAssistantCore, OfflineMailTranslator, TranslationPreferences */
(function initComposeAssistantBackground(global) {
  const api = global.messenger || global.browser;
  const core = global.ComposeAssistantCore;
  const SCRIPT_ID = "lianggu-compose-assistant-v1";
  const SCRIPT_JS = [
    "src/compose-assistant-core.js",
    "ui/compose-assistant-compose.js"
  ];
  const SCRIPT_CSS = ["ui/compose-assistant-compose.css"];
  const sessions = new Map();
  const popupWindowsByTab = new Map();
  const assistantPorts = new Set();

  if (!api || !core) return;

  async function getAssistantOptions() {
    const result = await api.storage.local.get("options");
    return {
      enabled: result.options?.composeAssistantEnabled !== false,
      customTerms: TranslationPreferences.normalizeCustomTerms(result.options?.customTerms || [])
        .filter(term => term.enabled !== false)
    };
  }

  function trimSessions() {
    if (sessions.size <= 6) return;
    const oldest = [...sessions.values()]
      .sort((left, right) => left.updatedAt - right.updatedAt)
      .slice(0, sessions.size - 6);
    oldest.forEach(session => sessions.delete(session.id));
  }

  async function composeWindowPosition(tab) {
    if (!api.windows?.get || typeof tab?.windowId !== "number") return {};
    try {
      const parent = await api.windows.get(tab.windowId);
      const width = 520;
      const height = Math.min(800, Math.max(620, Number(parent.height || 760) - 50));
      return {
        width,
        height,
        left: Math.max(0, Number(parent.left || 0) + Number(parent.width || width) - width - 20),
        top: Math.max(0, Number(parent.top || 0) + 34)
      };
    } catch (error) {
      return {};
    }
  }

  async function openOrRefreshPopup(tab, sessionId) {
    const currentWindowId = popupWindowsByTab.get(tab.id);
    if (typeof currentWindowId === "number") {
      try {
        await api.windows.update(currentWindowId, { focused: true });
        await api.runtime.sendMessage({
          type: "composeSuggestionSessionUpdated",
          sessionId
        });
        return currentWindowId;
      } catch (error) {
        popupWindowsByTab.delete(tab.id);
      }
    }
    if (!api.windows?.create) {
      throw new Error("当前 Thunderbird 无法打开多语回复窗口。");
    }
    const position = await composeWindowPosition(tab);
    const popup = await api.windows.create({
      ...position,
      type: "popup",
      focused: true,
      url: api.runtime.getURL(`ui/compose-assistant.html?session=${encodeURIComponent(sessionId)}`)
    });
    if (typeof popup?.id === "number") {
      popupWindowsByTab.set(tab.id, popup.id);
    }
    return popup?.id;
  }

  async function previewDraft(request, sender) {
    const tab = sender?.tab;
    if (typeof tab?.id !== "number") {
      throw new Error("没有找到当前写信窗口。");
    }
    const source = core.cleanText(request.source);
    if (!core.isEligibleChineseDraft(source)) {
      return { ok: false, ignored: true };
    }
    const sourceFingerprint = core.fingerprint(source);
    if (request.sourceFingerprint && request.sourceFingerprint !== sourceFingerprint) {
      return { ok: false, ignored: true };
    }

    const assistantOptions = await getAssistantOptions();
    if (!assistantOptions.enabled) {
      return { ok: false, ignored: true, reason: "disabled" };
    }
    const customTerms = assistantOptions.customTerms;
    const [composeDetails, suggestionResponse] = await Promise.all([
      api.compose?.getComposeDetails
        ? api.compose.getComposeDetails(tab.id).catch(() => ({}))
        : Promise.resolve({}),
      OfflineMailTranslator.composeSuggestions(source, customTerms)
    ]);
    const suggestions = core.normalizeSuggestionResponse(source, suggestionResponse);
    const sessionId = `compose-${tab.id}`;
    sessions.set(sessionId, {
      ...suggestions,
      id: sessionId,
      tabId: tab.id,
      windowId: tab.windowId,
      isPlainText: composeDetails?.isPlainText === true,
      customTermCount: customTerms.length,
      updatedAt: Date.now()
    });
    trimSessions();
    await openOrRefreshPopup(tab, sessionId);
    return { ok: true, sessionId };
  }

  function publicSession(session) {
    if (!session) return null;
    const {
      tabId: _tabId,
      windowId: _windowId,
      updatedAt: _updatedAt,
      ...safeSession
    } = session;
    return safeSession;
  }

  async function applySuggestion(request) {
    const session = sessions.get(String(request.sessionId || ""));
    if (!session) {
      return { ok: false, message: "回复候选已过期，请继续编辑中文草稿后重试。" };
    }
    const candidate = session.candidates.find(item => item.code === request.language);
    if (!candidate) {
      return { ok: false, message: "没有找到所选语种。" };
    }
    const response = await api.tabs.sendMessage(session.tabId, {
      type: "insertComposeSuggestion",
      candidate,
      isPlainText: session.isPlainText,
      sourceFingerprint: session.sourceFingerprint
    });
    if (!response?.ok) {
      return { ok: false, message: response?.message || "无法写入当前邮件。" };
    }
    sessions.delete(session.id);
    return { ok: true };
  }

  function onRuntimeMessage(request, sender) {
    if (request?.type === "previewComposeDraft") {
      return previewDraft(request, sender).catch(error => ({
        ok: false,
        message: error.message || "生成四语回复失败。"
      }));
    }
    if (request?.type === "getComposeSuggestionSession") {
      const session = sessions.get(String(request.sessionId || ""));
      return Promise.resolve(session
        ? { ok: true, session: publicSession(session) }
        : { ok: false, message: "回复候选已过期。" });
    }
    if (request?.type === "applyComposeSuggestion") {
      return applySuggestion(request).catch(error => ({
        ok: false,
        message: error.message || "插入当前邮件失败。"
      }));
    }
    return undefined;
  }

  async function ensureComposeScript() {
    const scripting = api.scripting?.compose;
    if (!scripting?.getRegisteredScripts || !scripting?.registerScripts) return false;
    const registered = await scripting.getRegisteredScripts({ ids: [SCRIPT_ID] });
    if (registered?.length) return false;
    await scripting.registerScripts([{
      id: SCRIPT_ID,
      js: SCRIPT_JS,
      css: SCRIPT_CSS,
      runAt: "document_idle"
    }]);
    return true;
  }

  async function injectIntoOpenComposeTabs() {
    if (!api.scripting?.executeScript || !api.scripting?.insertCSS || !api.tabs?.query) return;
    const tabs = await api.tabs.query({});
    for (const tab of tabs || []) {
      if (tab.type !== "messageCompose" || typeof tab.id !== "number") continue;
      try {
        await api.scripting.insertCSS({
          target: { tabId: tab.id },
          files: SCRIPT_CSS
        });
        await api.scripting.executeScript({
          target: { tabId: tab.id },
          files: SCRIPT_JS
        });
      } catch (error) {
        console.error("Failed to inject the compose assistant", error);
      }
    }
  }

  api.runtime.onMessage.addListener(onRuntimeMessage);
  if (api.runtime.onConnect) {
    api.runtime.onConnect.addListener(port => {
      if (port.name !== "compose-assistant-popup") return;
      assistantPorts.add(port);
      port.onDisconnect.addListener(() => assistantPorts.delete(port));
    });
  }
  if (api.windows?.onRemoved) {
    api.windows.onRemoved.addListener(windowId => {
      for (const [tabId, popupWindowId] of popupWindowsByTab) {
        if (popupWindowId === windowId) popupWindowsByTab.delete(tabId);
      }
    });
  }
  ensureComposeScript()
    .then(registeredNow => registeredNow ? injectIntoOpenComposeTabs() : undefined)
    .catch(error => console.error("Failed to register the compose assistant", error));
})(globalThis);
