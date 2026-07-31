/* global browser, messenger */
(function initThreadKeeper(global) {
  const SPECIAL_USES = new Set([
    "archives",
    "drafts",
    "junk",
    "outbox",
    "sent",
    "templates",
    "trash"
  ]);
  const SPECIAL_FOLDER_NAME = /^(archives?|drafts?|junk|outbox|sent|templates?|trash)$/i;

  function normalizeMessageId(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed) return "";
    const match = trimmed.match(/<[^<>\s]+>/);
    if (match) return match[0];
    return `<${trimmed.replace(/^<|>$/g, "")}>`;
  }

  function parseMessageIds(values) {
    const source = Array.isArray(values) ? values : [values];
    const seen = new Set();
    const messageIds = [];
    for (const value of source) {
      const matches = String(value || "").match(/<[^<>\s]+>/g) || [];
      for (const match of matches) {
        const normalized = normalizeMessageId(match);
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        messageIds.push(normalized);
      }
    }
    return messageIds;
  }

  function folderSpecialUses(folder) {
    const uses = folder?.specialUse;
    if (Array.isArray(uses)) return uses.map(value => String(value).toLowerCase());
    if (typeof uses === "string") return [uses.toLowerCase()];
    if (folder?.type) return [String(folder.type).toLowerCase()];
    return [];
  }

  function isWorkingFolder(folder) {
    if (!folder?.id) return false;
    if (folderSpecialUses(folder).some(value => SPECIAL_USES.has(value))) return false;
    return !SPECIAL_FOLDER_NAME.test(String(folder.name || "").trim());
  }

  function chooseWorkingMessage(messages) {
    return (messages || []).find(candidate => isWorkingFolder(candidate?.folder)) || null;
  }

  async function queryByHeaderMessageId(api, headerMessageId) {
    const normalized = normalizeMessageId(headerMessageId);
    if (!normalized || !api?.messages?.query) return [];
    const variants = [normalized, normalized.slice(1, -1)];
    const found = [];
    const seen = new Set();
    for (const variant of variants) {
      try {
        const list = await api.messages.query({ headerMessageId: variant });
        for (const candidate of list?.messages || []) {
          const key = String(candidate?.id ?? "");
          if (!key || seen.has(key)) continue;
          seen.add(key);
          found.push(candidate);
        }
      } catch (error) {
        // Thunderbird versions differ on whether angle brackets are accepted.
      }
      if (chooseWorkingMessage(found)) break;
    }
    return found;
  }

  function threadRoot(message, fallbackMessageId = "") {
    return {
      message,
      folder: message.folder,
      messageId: normalizeMessageId(message.headerMessageId || fallbackMessageId)
    };
  }

  async function resolveThreadRoot(api, details) {
    const relatedMessageId = details?.relatedMessageId;
    if (relatedMessageId === undefined || relatedMessageId === null) return null;

    let related;
    try {
      related = await api.messages.get(relatedMessageId);
    } catch (error) {
      return null;
    }

    if (isWorkingFolder(related?.folder)) {
      return threadRoot(related);
    }

    let full = { headers: {} };
    try {
      full = await api.messages.getFull(relatedMessageId);
    } catch (error) {
      // A missing MIME tree should not prevent the user's send operation.
    }

    const headers = full?.headers || {};
    const referenceIds = parseMessageIds([
      ...(Array.isArray(headers.references) ? headers.references : [headers.references]),
      ...(Array.isArray(headers["in-reply-to"])
        ? headers["in-reply-to"]
        : [headers["in-reply-to"]])
    ]);

    for (const referenceId of referenceIds) {
      const matches = await queryByHeaderMessageId(api, referenceId);
      const workingMessage = chooseWorkingMessage(matches);
      if (workingMessage) return threadRoot(workingMessage, referenceId);
    }

    return null;
  }

  async function prepareBeforeSend(api, tab, details) {
    const root = await resolveThreadRoot(api, details);
    if (!root?.folder?.id) return {};
    return {
      details: {
        overrideDefaultFccFolderId: root.folder.id
      },
      threadRoot: {
        folderId: root.folder.id,
        messageId: root.messageId,
        messageInternalId: root.message.id,
        composeTabId: tab?.id
      }
    };
  }

  async function writeAudit(api, result) {
    const record = {
      ...result,
      checkedAt: new Date().toISOString()
    };
    if (api?.storage?.local?.set) {
      await api.storage.local.set({
        liangguThreadKeeperLastResult: record
      });
    }
    return record;
  }

  async function verifyAfterSend(api, target, sendInfo) {
    if (!target) {
      return writeAudit(api, {
        status: "not_applicable",
        reason: "no_thread_root"
      });
    }
    if (sendInfo?.error) {
      return writeAudit(api, {
        status: "send_failed",
        reason: String(sendInfo.error),
        targetFolderId: target.folderId,
        rootMessageId: target.messageId
      });
    }

    let copies = Array.isArray(sendInfo?.messages) ? sendInfo.messages : [];
    const outgoingId = normalizeMessageId(sendInfo?.headerMessageId);
    if (!copies.length && outgoingId) {
      copies = await queryByHeaderMessageId(api, outgoingId);
    }
    const storedInTarget = copies.some(copy => copy?.folder?.id === target.folderId);
    return writeAudit(api, {
      status: storedInTarget ? "verified" : "pending_verification",
      targetFolderId: target.folderId,
      rootMessageId: target.messageId,
      outgoingMessageId: outgoingId,
      copyCount: copies.length
    });
  }

  async function beginReplyFromOriginal(api, originalMessage, replyType = "replyToSender") {
    if (!originalMessage?.id) throw new Error("没有找到客户原邮件。");
    return api.compose.beginReply(originalMessage.id, replyType);
  }

  async function getDisplayedMessage(api, sender) {
    const tabId = sender?.tab?.id;
    if (typeof tabId !== "number") throw new Error("没有找到当前邮件标签页。");
    if (api.messageDisplay?.getDisplayedMessages) {
      const list = await api.messageDisplay.getDisplayedMessages(tabId);
      const displayed = list?.messages?.[0];
      if (displayed) return displayed;
    }
    if (api.messageDisplay?.getDisplayedMessage) {
      const displayed = await api.messageDisplay.getDisplayedMessage(tabId);
      if (displayed) return displayed;
    }
    throw new Error("请先打开客户原邮件。");
  }

  function install(api) {
    if (!api || install.installed) return;
    install.installed = true;
    const pendingByTab = new Map();

    if (api.compose?.onBeforeSend?.addListener) {
      api.compose.onBeforeSend.addListener(async (tab, details) => {
        try {
          const prepared = await prepareBeforeSend(api, tab, details);
          if (prepared.threadRoot && typeof tab?.id === "number") {
            pendingByTab.set(tab.id, prepared.threadRoot);
          }
          return prepared.details ? { details: prepared.details } : {};
        } catch (error) {
          await writeAudit(api, {
            status: "unresolved",
            reason: String(error?.message || error)
          });
          return {};
        }
      });
    }

    if (api.compose?.onAfterSend?.addListener) {
      api.compose.onAfterSend.addListener(async (tab, sendInfo) => {
        const target = pendingByTab.get(tab?.id);
        pendingByTab.delete(tab?.id);
        try {
          await verifyAfterSend(api, target, sendInfo);
        } catch (error) {
          await writeAudit(api, {
            status: "verification_failed",
            reason: String(error?.message || error),
            targetFolderId: target?.folderId || ""
          });
        }
      });
    }

    if (api.runtime?.onMessage?.addListener) {
      api.runtime.onMessage.addListener((request, sender) => {
        if (request?.type !== "openReplyForDisplayedMessage") return undefined;
        return (async () => {
          const displayed = await getDisplayedMessage(api, sender);
          const root = await resolveThreadRoot(api, {
            type: "reply",
            relatedMessageId: displayed.id
          });
          const original = root?.message || displayed;
          return beginReplyFromOriginal(api, original, request.replyType || "replyToSender");
        })();
      });
    }
  }

  const exported = {
    beginReplyFromOriginal,
    install,
    isWorkingFolder,
    parseMessageIds,
    prepareBeforeSend,
    resolveThreadRoot,
    verifyAfterSend
  };

  global.LiangguThreadKeeper = exported;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = exported;
  }

  const api = global.messenger || global.browser;
  if (api) install(api);
})(globalThis);
