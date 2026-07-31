const assert = require("assert");
const ThreadKeeper = require("../src/thread-keeper.js");

function folder(id, name, type = "normal") {
  return { id, name, type };
}

function message(id, headerMessageId, messageFolder) {
  return {
    id,
    headerMessageId,
    folder: messageFolder
  };
}

function buildApi({
  messagesById = {},
  fullById = {},
  queryByHeader = {}
} = {}) {
  const storageWrites = [];
  const replyCalls = [];
  return {
    messages: {
      async get(id) {
        if (!messagesById[id]) throw new Error(`Unknown message ${id}`);
        return messagesById[id];
      },
      async getFull(id) {
        return fullById[id] || { headers: {} };
      },
      async query(query) {
        return {
          messages: queryByHeader[query.headerMessageId] || []
        };
      }
    },
    compose: {
      async beginReply(...args) {
        replyCalls.push(args);
        return { id: 9001 };
      }
    },
    storage: {
      local: {
        async set(value) {
          storageWrites.push(value);
        }
      }
    },
    storageWrites,
    replyCalls
  };
}

(async () => {
  const inquiryFolder = folder("local://00-new-rfq", "00_New_RFQ_新询价");
  const draftsFolder = folder("imap://drafts", "Drafts", "drafts");
  const sentFolder = folder("imap://sent", "Sent", "sent");
  const original = message(11, "<original@example.com>", inquiryFolder);
  const draft = message(22, "<draft@chlgvalve.com>", draftsFolder);

  assert.deepStrictEqual(
    ThreadKeeper.parseMessageIds([
      "<original@example.com> <draft@chlgvalve.com>",
      " <draft@chlgvalve.com> "
    ]),
    ["<original@example.com>", "<draft@chlgvalve.com>"],
    "References should keep the oldest-first order and remove duplicates."
  );

  const directApi = buildApi({
    messagesById: { 11: original }
  });
  const directRoot = await ThreadKeeper.resolveThreadRoot(directApi, {
    type: "reply",
    relatedMessageId: 11
  });
  assert.strictEqual(directRoot.message.id, 11);
  assert.strictEqual(directRoot.folder.id, inquiryFolder.id);

  const draftApi = buildApi({
    messagesById: { 22: draft },
    fullById: {
      22: {
        headers: {
          references: ["<original@example.com> <draft@chlgvalve.com>"],
          "in-reply-to": ["<draft-parent@chlgvalve.com>"]
        }
      }
    },
    queryByHeader: {
      "<original@example.com>": [original],
      "<draft@chlgvalve.com>": [draft]
    }
  });
  const draftRoot = await ThreadKeeper.resolveThreadRoot(draftApi, {
    type: "draft",
    relatedMessageId: 22
  });
  assert.strictEqual(
    draftRoot.message.id,
    11,
    "A saved draft must resolve back to the oldest customer message."
  );

  const duplicateApi = buildApi({
    messagesById: { 22: draft },
    fullById: {
      22: {
        headers: {
          references: ["<original@example.com>"]
        }
      }
    },
    queryByHeader: {
      "<original@example.com>": [
        message(33, "<original@example.com>", sentFolder),
        original
      ]
    }
  });
  const duplicateRoot = await ThreadKeeper.resolveThreadRoot(duplicateApi, {
    type: "draft",
    relatedMessageId: 22
  });
  assert.strictEqual(
    duplicateRoot.folder.id,
    inquiryFolder.id,
    "When duplicate copies exist, use the working folder instead of Sent."
  );

  const beforeResult = await ThreadKeeper.prepareBeforeSend(
    draftApi,
    { id: 501 },
    { type: "draft", relatedMessageId: 22 }
  );
  assert.deepStrictEqual(beforeResult.details, {
    overrideDefaultFccFolderId: inquiryFolder.id
  });
  assert.strictEqual(beforeResult.threadRoot.messageId, "<original@example.com>");

  const newMessageResult = await ThreadKeeper.prepareBeforeSend(
    draftApi,
    { id: 502 },
    { type: "new" }
  );
  assert.deepStrictEqual(
    newMessageResult,
    {},
    "A genuinely new outbound message must keep the user's normal Sent settings."
  );

  const verified = await ThreadKeeper.verifyAfterSend(
    draftApi,
    {
      folderId: inquiryFolder.id,
      messageId: "<original@example.com>"
    },
    {
      messages: [message(44, "<sent-reply@chlgvalve.com>", inquiryFolder)],
      headerMessageId: "<sent-reply@chlgvalve.com>"
    }
  );
  assert.strictEqual(verified.status, "verified");
  assert.strictEqual(
    draftApi.storageWrites.at(-1).liangguThreadKeeperLastResult.status,
    "verified"
  );

  const replyApi = buildApi();
  await ThreadKeeper.beginReplyFromOriginal(replyApi, original, "replyToSender");
  assert.deepStrictEqual(replyApi.replyCalls, [[11, "replyToSender"]]);

  const eventListeners = {};
  const installedApi = buildApi({
    messagesById: { 11: original }
  });
  installedApi.compose.onBeforeSend = {
    addListener(listener) {
      eventListeners.beforeSend = listener;
    }
  };
  installedApi.compose.onAfterSend = {
    addListener(listener) {
      eventListeners.afterSend = listener;
    }
  };
  installedApi.runtime = {
    onMessage: {
      addListener(listener) {
        eventListeners.runtimeMessage = listener;
      }
    }
  };
  installedApi.messageDisplay = {
    async getDisplayedMessages() {
      return { messages: [original] };
    }
  };
  ThreadKeeper.install(installedApi);
  assert.ok(eventListeners.beforeSend && eventListeners.afterSend && eventListeners.runtimeMessage);

  const eventBeforeResult = await eventListeners.beforeSend(
    { id: 701 },
    { type: "reply", relatedMessageId: 11 }
  );
  assert.deepStrictEqual(eventBeforeResult, {
    details: { overrideDefaultFccFolderId: inquiryFolder.id }
  });
  await eventListeners.afterSend(
    { id: 701 },
    {
      messages: [message(55, "<sent-by-event@chlgvalve.com>", inquiryFolder)],
      headerMessageId: "<sent-by-event@chlgvalve.com>"
    }
  );
  assert.strictEqual(
    installedApi.storageWrites.at(-1).liangguThreadKeeperLastResult.status,
    "verified"
  );
  await eventListeners.runtimeMessage(
    { type: "openReplyForDisplayedMessage", replyType: "replyToSender" },
    { tab: { id: 702 } }
  );
  assert.deepStrictEqual(installedApi.replyCalls, [[11, "replyToSender"]]);

  console.log("thread-keeper-regression: ok");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
