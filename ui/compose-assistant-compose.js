/* global browser, messenger, ComposeAssistantCore */
(function initComposeAssistantInEditor(global) {
  const api = global.messenger || global.browser;
  const core = global.ComposeAssistantCore;
  const ROOT_MARKER = "gmsComposeAssistantMounted";
  const PROTECTED_SELECTOR = [
    ".moz-signature",
    "[data-moz-signature]",
    ".moz-cite-prefix",
    "blockquote[type='cite']",
    "blockquote[cite]",
    "table.moz-email-headers-table"
  ].join(",");
  let debounceTimer = null;
  let lastRequestedFingerprint = "";
  let lastObservedFingerprint = "";
  let lastSelection = null;
  let applyingSuggestion = false;

  if (!api?.runtime?.sendMessage || !core || document.documentElement.dataset[ROOT_MARKER] === "true") {
    return;
  }
  document.documentElement.dataset[ROOT_MARKER] = "true";

  function cloneDraftBody() {
    const clone = document.body.cloneNode(true);
    for (const node of clone.querySelectorAll(PROTECTED_SELECTOR)) {
      node.remove();
    }
    return clone;
  }

  function currentDraftText() {
    const clone = cloneDraftBody();
    return core.cleanText(clone.innerText || clone.textContent || "");
  }

  function saveSelection() {
    const selection = document.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (document.body.contains(range.commonAncestorContainer)) {
      lastSelection = range.cloneRange();
    }
  }

  function schedulePreview() {
    saveSelection();
    if (applyingSuggestion) return;
    clearTimeout(debounceTimer);
    const source = currentDraftText();
    if (!core.isEligibleChineseDraft(source)) {
      if (lastRequestedFingerprint || lastObservedFingerprint) {
        lastRequestedFingerprint = "";
        lastObservedFingerprint = "";
        api.runtime.sendMessage({ type: "clearComposeDraftPreview" }).catch(() => undefined);
      }
      return;
    }
    const sourceFingerprint = core.fingerprint(source);
    if (sourceFingerprint !== lastObservedFingerprint) {
      lastObservedFingerprint = sourceFingerprint;
      api.runtime.sendMessage({
        type: "composeDraftPreviewPending",
        sourceFingerprint
      }).catch(() => undefined);
    }
    if (sourceFingerprint === lastRequestedFingerprint) return;
    debounceTimer = setTimeout(async () => {
      const latestSource = currentDraftText();
      const latestFingerprint = core.fingerprint(latestSource);
      if (
        latestFingerprint !== sourceFingerprint ||
        !core.isEligibleChineseDraft(latestSource)
      ) {
        return;
      }
      lastRequestedFingerprint = latestFingerprint;
      try {
        await api.runtime.sendMessage({
          type: "previewComposeDraft",
          source: latestSource,
          sourceFingerprint: latestFingerprint
        });
      } catch (error) {
        lastRequestedFingerprint = "";
        console.error("Failed to preview the compose draft", error);
      }
    }, 500);
  }

  function createHtmlBlock(block, candidate) {
    const container = document.createElement("div");
    container.lang = candidate.lang;
    container.dir = candidate.direction;
    container.className = `gms-compose-inserted-block gms-compose-${block.type}`;
    if (block.type === "field" && block.label) {
      const label = document.createElement("strong");
      label.textContent = `${block.label}：`;
      container.append(label, document.createTextNode(block.text));
    } else {
      container.textContent = block.text;
    }
    return container;
  }

  function createCandidateFragment(candidate, isPlainText) {
    const fragment = document.createDocumentFragment();
    if (isPlainText) {
      const lines = core.candidateToPlainText(candidate).split("\n");
      lines.forEach((line, index) => {
        if (index) fragment.appendChild(document.createElement("br"));
        fragment.appendChild(document.createTextNode(line));
      });
      return fragment;
    }
    for (const block of candidate.blocks) {
      fragment.appendChild(createHtmlBlock(block, candidate));
    }
    return fragment;
  }

  function replaceDraft(candidate, isPlainText) {
    const fragment = createCandidateFragment(candidate, isPlainText);
    const lastInsertedNode = fragment.lastChild;
    const boundary = document.body.querySelector(PROTECTED_SELECTOR);
    applyingSuggestion = true;

    if (boundary) {
      const deleteRange = document.createRange();
      deleteRange.setStart(document.body, 0);
      deleteRange.setEndBefore(boundary);
      deleteRange.deleteContents();
      deleteRange.insertNode(fragment);
      const spacer = document.createElement("br");
      spacer.className = "gms-compose-inserted-spacer";
      boundary.parentNode.insertBefore(spacer, boundary);
    } else {
      document.body.replaceChildren(fragment);
    }

    const selection = document.getSelection();
    const range = document.createRange();
    const caretTarget = lastInsertedNode || document.body.lastChild || document.body;
    range.selectNodeContents(caretTarget);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    lastSelection = range.cloneRange();
    lastRequestedFingerprint = core.fingerprint(currentDraftText());
    lastObservedFingerprint = lastRequestedFingerprint;
    document.body.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertReplacementText"
    }));
    document.body.focus();
    applyingSuggestion = false;
  }

  function onRuntimeMessage(request) {
    if (request?.type !== "insertComposeSuggestion") return undefined;
    const candidate = request.candidate;
    if (!candidate?.blocks?.length) {
      return Promise.resolve({ ok: false, message: "没有可插入的语种内容。" });
    }
    const currentFingerprint = core.fingerprint(currentDraftText());
    if (
      request.sourceFingerprint &&
      request.sourceFingerprint !== currentFingerprint
    ) {
      return Promise.resolve({
        ok: false,
        stale: true,
        message: "中文草稿已经变化，四语版本正在实时更新，请稍后再插入。"
      });
    }
    try {
      replaceDraft(candidate, request.isPlainText === true);
      return Promise.resolve({ ok: true });
    } catch (error) {
      if (lastSelection) {
        const selection = document.getSelection();
        selection.removeAllRanges();
        selection.addRange(lastSelection);
      }
      return Promise.resolve({ ok: false, message: error.message || "插入邮件失败。" });
    }
  }

  document.body.addEventListener("input", schedulePreview, true);
  document.addEventListener("selectionchange", saveSelection);
  api.runtime.onMessage.addListener(onRuntimeMessage);
  setTimeout(schedulePreview, 0);
})(globalThis);
