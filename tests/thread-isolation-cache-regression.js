const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const buyerMessage = {
  id: 1,
  headerMessageId: "buyer-a-1@example.test",
  subject: "RFQ",
  author: "Buyer A <buyer@customer-a.example>",
  recipients: ["Sales <sales@our-company.example>"],
  ccList: [],
  date: "2026-07-20T01:00:00Z",
  folder: { id: "folder-1", accountId: "account-1", path: "/Inbox" }
};
const unrelatedSameSubject = {
  id: 99,
  headerMessageId: "buyer-b-1@example.test",
  subject: "RFQ",
  author: "Buyer B <buyer@customer-b.example>",
  recipients: ["Sales <sales@our-company.example>"],
  ccList: [],
  date: "2026-07-20T02:00:00Z",
  folder: buyerMessage.folder
};
const ourReply = {
  id: 2,
  headerMessageId: "our-reply-1@example.test",
  subject: "Re: RFQ",
  author: "Sales <sales@our-company.example>",
  recipients: ["Buyer A <buyer@customer-a.example>"],
  ccList: [],
  date: "2026-07-21T01:00:00Z",
  folder: buyerMessage.folder
};

const allMessages = new Map([
  [buyerMessage.id, buyerMessage],
  [unrelatedSameSubject.id, unrelatedSameSubject],
  [ourReply.id, ourReply]
]);
let queryMessages = [buyerMessage, unrelatedSameSubject];
const bodies = new Map([
  [1, "Please quote 10 pcs ball valve DN50 PN16 WCB."],
  [99, "Please quote 20 pcs gate valve DN100 PN25."],
  [2, "We are preparing the quotation for the ball valve."]
]);
const storage = {};

const sandbox = {
  console,
  URL,
  browser: {
    accounts: {
      list: async () => [{ identities: [{ email: "sales@our-company.example" }] }]
    },
    storage: {
      local: {
        get: async key => typeof key === "string" ? { [key]: storage[key] } : {},
        set: async values => Object.assign(storage, values)
      }
    },
    messages: {
      get: async id => allMessages.get(id),
      query: async () => ({ messages: queryMessages }),
      listInlineTextParts: async id => [{ contentType: "text/plain", content: bodies.get(id) }]
    }
  }
};
sandbox.globalThis = sandbox;

for (const relativePath of ["src/customer-intelligence.js", "src/summary.js"]) {
  const source = fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
  vm.runInNewContext(source, sandbox, { filename: relativePath });
}

(async () => {
  const first = await sandbox.GameMailSummary.getConversationSummary(1, {});
  assert.strictEqual(first.conversation.messageCount, 1, "Same-subject mail from another customer must be excluded.");
  assert.ok(first.productCategories.some(value => value.includes("Ball valve")));
  assert.ok(!first.productCategories.some(value => value.includes("Gate valve")));

  queryMessages = [buyerMessage, unrelatedSameSubject, ourReply];
  const afterReply = await sandbox.GameMailSummary.getConversationSummary(1, {});
  assert.strictEqual(afterReply.conversation.messageCount, 2, "A new reply must invalidate the cached conversation fingerprint.");
  assert.ok(!afterReply.productCategories.some(value => value.includes("Gate valve")));

  console.log("thread-isolation-cache-regression: ok");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
