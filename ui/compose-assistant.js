/* global browser, messenger, ComposeAssistantCore */
(function initComposeAssistantWindow(global) {
  const api = global.messenger || global.browser;
  const core = global.ComposeAssistantCore;
  const keepAlivePort = typeof api.runtime.connect === "function"
    ? api.runtime.connect({ name: "compose-assistant-popup" })
    : null;
  const elements = {
    state: document.getElementById("state"),
    content: document.getElementById("assistantContent"),
    syncState: document.getElementById("syncState"),
    updatedAt: document.getElementById("updatedAt"),
    warningPanel: document.getElementById("warningPanel"),
    warnings: document.getElementById("warnings"),
    technicalSection: document.getElementById("technicalSection"),
    technicalTerms: document.getElementById("technicalTerms"),
    reviewConfirmation: document.getElementById("reviewConfirmation"),
    reviewCheckbox: document.getElementById("reviewCheckbox"),
    tabs: document.getElementById("languageTabs"),
    languageLabel: document.getElementById("languageLabel"),
    candidateTitle: document.getElementById("candidateTitle"),
    directionHint: document.getElementById("directionHint"),
    preview: document.getElementById("candidatePreview"),
    insert: document.getElementById("insertCandidate")
  };
  let sessionId = new URLSearchParams(location.search).get("session") || "";
  let session = null;
  let activeLanguage = "zh";
  let refreshing = false;

  function clear(node) {
    node.replaceChildren();
  }

  function createElement(tagName, className, text) {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function showError(error) {
    elements.state.hidden = false;
    elements.state.classList.add("error");
    elements.state.textContent = error?.message || "多语回复助手加载失败。";
    elements.content.hidden = true;
  }

  function renderWarnings() {
    clear(elements.warnings);
    const warnings = session?.warnings || [];
    elements.warningPanel.hidden = warnings.length === 0;
    warnings.forEach(value => {
      elements.warnings.appendChild(createElement("li", "", value));
    });
  }

  function renderTerms() {
    clear(elements.technicalTerms);
    const terms = session?.technicalTerms || [];
    elements.technicalSection.hidden = terms.length === 0;
    terms.forEach(value => {
      elements.technicalTerms.appendChild(createElement("span", "chip", value));
    });
  }

  function updateInsertState() {
    const candidate = session?.candidates?.find(item => item.code === activeLanguage);
    if (!candidate) return;
    if (refreshing) {
      elements.insert.disabled = true;
      elements.insert.textContent = "正在根据新草稿更新";
      return;
    }
    const reviewPending = session.requiresHumanReview && !elements.reviewCheckbox.checked;
    elements.insert.disabled = reviewPending;
    elements.insert.textContent = reviewPending
      ? `复核后插入${candidate.label}`
      : `插入${candidate.label}`;
  }

  function selectLanguage(code, moveFocus = false) {
    const candidate = session?.candidates?.find(item => item.code === code);
    if (!candidate) return;
    activeLanguage = code;
    for (const button of elements.tabs.querySelectorAll(".language-tab")) {
      const selected = button.dataset.language === code;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
      if (selected && moveFocus) button.focus();
    }

    elements.languageLabel.textContent = `${candidate.label}回复`;
    elements.candidateTitle.textContent = candidate.nativeLabel;
    elements.directionHint.textContent = candidate.direction === "rtl" ? "从右向左阅读" : "已按商务邮件排版";
    elements.preview.lang = candidate.lang;
    elements.preview.dir = candidate.direction;
    clear(elements.preview);
    for (const block of candidate.blocks) {
      const node = createElement("p", `preview-block preview-${block.type}`);
      if (block.type === "field" && block.label) {
        node.append(
          createElement("strong", "", block.label),
          document.createTextNode(block.text)
        );
      } else {
        node.textContent = block.text;
      }
      elements.preview.appendChild(node);
    }
    updateInsertState();
  }

  function renderTabs() {
    clear(elements.tabs);
    session.candidates.forEach(candidate => {
      const button = createElement("button", "language-tab");
      button.type = "button";
      button.role = "tab";
      button.dataset.language = candidate.code;
      button.setAttribute("aria-selected", String(candidate.code === activeLanguage));
      button.tabIndex = candidate.code === activeLanguage ? 0 : -1;
      button.append(
        document.createTextNode(candidate.label),
        createElement("span", "", candidate.nativeLabel)
      );
      button.addEventListener("click", () => selectLanguage(candidate.code));
      button.addEventListener("keydown", event => {
        if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault();
        const currentIndex = core.LANGUAGE_ORDER.indexOf(candidate.code);
        const delta = ["ArrowUp", "ArrowLeft"].includes(event.key) ? -1 : 1;
        const nextIndex = (currentIndex + delta + core.LANGUAGE_ORDER.length) % core.LANGUAGE_ORDER.length;
        selectLanguage(core.LANGUAGE_ORDER[nextIndex], true);
      });
      elements.tabs.appendChild(button);
    });
  }

  function renderSession(nextSession) {
    session = nextSession;
    sessionId = nextSession.id;
    if (!session.candidates.some(candidate => candidate.code === activeLanguage)) {
      activeLanguage = "zh";
    }
    elements.state.hidden = true;
    elements.state.classList.remove("error");
    elements.content.hidden = false;
    refreshing = false;
    elements.syncState.classList.remove("refreshing");
    elements.syncState.textContent = `已同步 ${session.source.length} 字`;
    elements.updatedAt.textContent = session.isPlainText
      ? "实时跟随 · 纯文本"
      : "实时跟随 · 支持重点加粗";
    elements.reviewCheckbox.checked = false;
    elements.reviewConfirmation.hidden = !session.requiresHumanReview;
    renderWarnings();
    renderTerms();
    renderTabs();
    selectLanguage(activeLanguage);
  }

  async function loadSession() {
    if (!sessionId) throw new Error("没有找到当前回复草稿。");
    const response = await api.runtime.sendMessage({
      type: "getComposeSuggestionSession",
      sessionId
    });
    if (!response?.ok) throw new Error(response?.message || "回复候选已过期，请继续编辑中文草稿。");
    renderSession(response.session);
  }

  async function insertCandidate() {
    const candidate = session?.candidates?.find(item => item.code === activeLanguage);
    if (!candidate) return;
    elements.insert.disabled = true;
    elements.insert.textContent = "正在插入…";
    try {
      const response = await api.runtime.sendMessage({
        type: "applyComposeSuggestion",
        sessionId,
        language: activeLanguage,
        humanReviewConfirmed: elements.reviewCheckbox.checked
      });
      if (!response?.ok) throw new Error(response?.message || "插入当前邮件失败。");
      elements.insert.textContent = "已插入当前邮件";
      setTimeout(() => global.close(), 450);
    } catch (error) {
      elements.insert.disabled = false;
      elements.insert.textContent = `重试插入${candidate.label}`;
      showError(error);
    }
  }

  elements.insert.addEventListener("click", insertCandidate);
  elements.reviewCheckbox.addEventListener("change", updateInsertState);
  global.addEventListener("beforeunload", () => keepAlivePort?.disconnect?.(), { once: true });
  api.runtime.onMessage.addListener(request => {
    if (request?.type === "composeSuggestionSessionPending" && request.sessionId === sessionId) {
      refreshing = true;
      elements.syncState.classList.add("refreshing");
      elements.syncState.textContent = "正在根据新草稿更新";
      updateInsertState();
      return undefined;
    }
    if (request?.type !== "composeSuggestionSessionUpdated" || request.sessionId !== sessionId) {
      return undefined;
    }
    refreshing = true;
    elements.syncState.classList.add("refreshing");
    elements.syncState.textContent = "正在刷新";
    loadSession().catch(showError);
    return undefined;
  });
  loadSession().catch(showError);
})(globalThis);
