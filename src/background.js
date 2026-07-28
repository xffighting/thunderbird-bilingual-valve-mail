/* global browser, messenger, GameMailSummary, CustomerIntelligence, OfflineMailTranslator, TranslationPreferences */
(function initBackground(global) {
  const api = global.messenger || global.browser;
  const MESSAGE_DISPLAY_SCRIPT_ID = "game-mail-summary-inline-v4";
  const LEGACY_MESSAGE_DISPLAY_SCRIPT_IDS = ["game-mail-summary-inline-v3"];
  const MESSAGE_DISPLAY_JS = [
    "src/inline-translation-core.js",
    "ui/message-summary-button.js",
    "ui/inline-translation.js"
  ];
  const MESSAGE_DISPLAY_CSS = [
    "ui/message-summary-button.css",
    "ui/inline-translation.css"
  ];

  async function getStoredOptions() {
    const result = await api.storage.local.get("options");
    return {
      ...GameMailSummary.DEFAULT_OPTIONS,
      ...(result.options || {}),
      customTerms: TranslationPreferences.normalizeCustomTerms(result.options?.customTerms || []),
      translationFeedback: TranslationPreferences.normalizeTranslationFeedback(
        result.options?.translationFeedback || []
      )
    };
  }

  function summaryBadgeText(summary) {
    if (summary?.orderStatus?.level === "done") return "成交";
    if (summary?.orderStatus?.level === "possible") return "询价";
    return "";
  }

  function actionTitle(summary) {
    const badge = summaryBadgeText(summary);
    return badge ? `摘要：${badge}` : "摘要";
  }

  async function getActiveTab() {
    const tabs = await api.tabs.query({ active: true, currentWindow: true });
    return tabs && tabs.length ? tabs[0] : null;
  }

  async function getCurrentMessage() {
    const tab = await getActiveTab();
    if (!tab) {
      throw new Error("没有找到当前 Thunderbird 标签页。");
    }

    if (api.messageDisplay?.getDisplayedMessages) {
      try {
        const list = await api.messageDisplay.getDisplayedMessages(tab.id);
        const messages = list?.messages || [];
        if (messages.length) return messages[0];
      } catch (error) {
        // Continue with mailTabs selection below.
      }
    } else if (api.messageDisplay?.getDisplayedMessage) {
      try {
        const message = await api.messageDisplay.getDisplayedMessage(tab.id);
        if (message) return message;
      } catch (error) {
        // Compatibility fallback for older Thunderbird versions.
      }
    }

    if (api.mailTabs?.getSelectedMessages) {
      const list = await api.mailTabs.getSelectedMessages(tab.id);
      const selected = list?.messages || [];
      if (selected.length) return selected[0];
    }

    throw new Error("请先打开或选中一封邮件。");
  }

  async function getDisplayedMessageForTab(tabId) {
    if (typeof tabId === "number" && api.messageDisplay?.getDisplayedMessages) {
      try {
        const list = await api.messageDisplay.getDisplayedMessages(tabId);
        return list?.messages?.[0] || null;
      } catch (error) {
        return null;
      }
    }
    if (typeof tabId === "number" && api.messageDisplay?.getDisplayedMessage) {
      try {
        return await api.messageDisplay.getDisplayedMessage(tabId);
      } catch (error) {
        return null;
      }
    }
    return null;
  }

  async function getSummaryForMessageId(messageId, options) {
    return GameMailSummary.getConversationSummary(messageId, options || {});
  }

  async function getSummaryForCurrentMessage(options) {
    const message = await getCurrentMessage();
    return getSummaryForMessageId(message.id, options || {});
  }

  async function getSummaryForSender(sender, options) {
    const message = await getDisplayedMessageForTab(sender?.tab?.id);
    if (message) {
      return getSummaryForMessageId(message.id, options || {});
    }
    return getSummaryForCurrentMessage(options || {});
  }

  async function refreshActionForMessage(tabId, message) {
    try {
      const summary = await getSummaryForMessageId(message.id, { force: false });
      const badgeText = summaryBadgeText(summary);
      const title = actionTitle(summary);

      if (api.messageDisplayAction?.setTitle) {
        await api.messageDisplayAction.setTitle({ tabId, title });
      }
      if (api.messageDisplayAction?.setBadgeText) {
        await api.messageDisplayAction.setBadgeText({ tabId, text: badgeText });
      }
      if (api.action?.setTitle) {
        await api.action.setTitle({ tabId, title });
      }
      if (api.action?.setBadgeText) {
        await api.action.setBadgeText({ tabId, text: badgeText });
      }
    } catch (error) {
      if (api.messageDisplayAction?.setTitle) {
        await api.messageDisplayAction.setTitle({ tabId, title: `摘要生成失败：${error.message}` });
      }
      if (api.action?.setTitle) {
        await api.action.setTitle({ tabId, title: `摘要生成失败：${error.message}` });
      }
    }
  }

  async function ensureMessageDisplayScript() {
    if (!api.scripting?.messageDisplay?.getRegisteredScripts || !api.scripting?.messageDisplay?.registerScripts) {
      return false;
    }
    if (api.scripting.messageDisplay.unregisterScripts) {
      const legacyScripts = await api.scripting.messageDisplay.getRegisteredScripts({
        ids: LEGACY_MESSAGE_DISPLAY_SCRIPT_IDS
      });
      if (legacyScripts?.length) {
        await api.scripting.messageDisplay.unregisterScripts({
          ids: legacyScripts.map(script => script.id)
        });
      }
    }
    const registered = await api.scripting.messageDisplay.getRegisteredScripts({
      ids: [MESSAGE_DISPLAY_SCRIPT_ID]
    });
    if (registered?.length) return false;
    await api.scripting.messageDisplay.registerScripts([{
      id: MESSAGE_DISPLAY_SCRIPT_ID,
      js: MESSAGE_DISPLAY_JS,
      css: MESSAGE_DISPLAY_CSS,
      runAt: "document_idle"
    }]);
    return true;
  }

  async function injectIntoOpenMessageTabs() {
    if (!api.scripting?.executeScript || !api.scripting?.insertCSS || !api.tabs?.query) return;
    const tabs = await api.tabs.query({});
    for (const tab of tabs || []) {
      if (typeof tab.id !== "number") continue;
      const message = await getDisplayedMessageForTab(tab.id);
      if (!message) continue;
      try {
        await api.scripting.insertCSS({
          target: { tabId: tab.id },
          files: MESSAGE_DISPLAY_CSS
        });
        await api.scripting.executeScript({
          target: { tabId: tab.id },
          files: MESSAGE_DISPLAY_JS
        });
      } catch (error) {
        // Some Thunderbird tab types cannot host message display scripts.
      }
    }
  }

  async function openDingTalkLink(rawUrl) {
    const validation = CustomerIntelligence.validateDingTalkUrl(rawUrl);
    if (validation.status !== "available") {
      throw new Error("钉钉链接未配置或不在安全白名单中。");
    }
    if (api.windows?.openDefaultBrowser) {
      await api.windows.openDefaultBrowser(validation.url);
      return { opened: true };
    }
    throw new Error("当前 Thunderbird 无法调用系统浏览器。");
  }

  if (api.messageDisplay?.onMessagesDisplayed) {
    api.messageDisplay.onMessagesDisplayed.addListener((tab, displayedMessages) => {
      const messages = displayedMessages?.messages || [];
      if (messages.length) refreshActionForMessage(tab.id, messages[0]);
    });
  } else if (api.messageDisplay?.onMessageDisplayed) {
    api.messageDisplay.onMessageDisplayed.addListener((tab, message) => {
      refreshActionForMessage(tab.id, message);
    });
  }

  if (api.mailTabs?.onSelectedMessagesChanged) {
    api.mailTabs.onSelectedMessagesChanged.addListener((tab, selectedMessages) => {
      const messages = selectedMessages?.messages || [];
      if (messages.length) {
        refreshActionForMessage(tab.id, messages[0]);
      }
    });
  }

  api.runtime.onMessage.addListener((request, sender) => {
    if (!request || !request.type) return undefined;

    if (request.type === "getSummaryForCurrentMessage") {
      return getSummaryForCurrentMessage(request.options || {});
    }

    if (request.type === "getSummaryForDisplayedMessage") {
      return getSummaryForSender(sender, request.options || {});
    }

    if (request.type === "getSummaryByMessageId") {
      return getSummaryForMessageId(request.messageId, request.options || {});
    }

    if (request.type === "getOptions") {
      return getStoredOptions();
    }

    if (request.type === "saveOptions") {
      const incoming = request.options || {};
      const options = {
        ...GameMailSummary.DEFAULT_OPTIONS,
        ...incoming,
        ownDomains: Array.isArray(incoming.ownDomains) ? incoming.ownDomains : [],
        ownEmails: Array.isArray(incoming.ownEmails) ? incoming.ownEmails : [],
        customerRecords: CustomerIntelligence.normalizeRegistry(incoming.customerRecords || []),
        customTerms: TranslationPreferences.normalizeCustomTerms(incoming.customTerms || []),
        translationFeedback: TranslationPreferences.normalizeTranslationFeedback(
          incoming.translationFeedback || []
        ),
        cacheEpoch: Date.now()
      };
      return api.storage.local.set({ options }).then(() => options);
    }

    if (request.type === "openDingTalkLink") {
      return openDingTalkLink(request.url);
    }

    if (request.type === "translateInlineBatch") {
      return getStoredOptions().then(options => {
        return OfflineMailTranslator.translateBatch(request.texts || [], options.customTerms);
      });
    }

    if (request.type === "checkOfflineTranslator") {
      return OfflineMailTranslator.health();
    }

    if (request.type === "runTranslationBenchmark") {
      return getStoredOptions().then(options => {
        return OfflineMailTranslator.benchmark(options.customTerms);
      });
    }

    if (request.type === "saveTranslationFeedback") {
      return getStoredOptions().then(options => {
        const result = TranslationPreferences.upsertTranslationFeedback(
          options.translationFeedback,
          request
        );
        if (!result.record) throw new Error("请填写原文术语和正确中文译法。");
        options.translationFeedback = result.feedback;
        return api.storage.local.set({ options }).then(() => ({
          ok: true,
          feedbackId: result.record.id,
          created: result.created,
          feedbackCount: options.translationFeedback.filter(item => item.status === "pending").length
        }));
      });
    }

    if (request.type === "reviewTranslationFeedback") {
      return getStoredOptions().then(options => {
        const reviewed = TranslationPreferences.reviewTranslationFeedback(
          options.translationFeedback,
          options.customTerms,
          request.feedbackId,
          request.action
        );
        const saved = {
          ...options,
          customTerms: reviewed.customTerms,
          translationFeedback: reviewed.feedback,
          cacheEpoch: Date.now()
        };
        return api.storage.local.set({ options: saved }).then(() => saved);
      });
    }

    if (request.type === "openOptionsPage") {
      return api.runtime.openOptionsPage();
    }

    if (request.type === "formatTooltip") {
      return Promise.resolve(GameMailSummary.formatTooltip(request.summary));
    }

    return undefined;
  });

  ensureMessageDisplayScript()
    .then(registeredNow => registeredNow ? injectIntoOpenMessageTabs() : undefined)
    .catch(error => {
      console.error("Failed to register message display script", error);
    });
})(globalThis);
