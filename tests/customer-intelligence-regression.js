const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const sourcePath = path.join(__dirname, "..", "src", "customer-intelligence.js");
const source = fs.readFileSync(sourcePath, "utf8");
const sandbox = { console, URL };
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox, { filename: sourcePath });

const customerIntel = sandbox.CustomerIntelligence;
const summary = {
  conversation: { messageCount: 6 },
  productCategories: ["球阀 / Ball valve"],
  orderStatus: { level: "possible" },
  keyPointGroups: []
};

const csv = [
  "email,domain,company,grade,order_count,active_opportunities,dingtalk_url",
  "buyer@example-industrial.com,example-industrial.com,Example Industrial,B,2,1,https://alidocs.dingtalk.com/i/nodes/example"
].join("\n");
const records = customerIntel.parseRegistryText(csv, "customers.csv");
assert.strictEqual(records.length, 1);
assert.strictEqual(records[0].company, "Example Industrial");
assert.strictEqual(
  JSON.stringify(customerIntel.normalizeRegistry(records)[0].emails),
  JSON.stringify(["buyer@example-industrial.com"]),
  "Normalized records must survive a storage round-trip."
);

function build(author, customerRecords, recipients) {
  const header = {
    author,
    recipients: recipients || [],
    ccList: []
  };
  return customerIntel.buildCustomerInsight(
    header,
    [{ header }],
    summary,
    { customerRecords, ownDomains: ["our-company.com"] }
  );
}

const exact = build("Buyer <buyer@example-industrial.com>", records);
assert.strictEqual(exact.identity.matchType, "email");
assert.strictEqual(exact.identity.confidence, "high");
assert.strictEqual(exact.importance.level, "B");
assert.strictEqual(exact.dingtalk.status, "available");

const domain = build("New Contact <new@example-industrial.com>", records);
assert.strictEqual(domain.identity.matchType, "domain");
assert.strictEqual(domain.identity.confidence, "medium");
assert.strictEqual(domain.dingtalk.status, "review");
assert.strictEqual(domain.dingtalk.url, "");

const publicDomain = customerIntel.parseRegistryText(
  "domain,company\ngmail.com,Wrong Domain Match",
  "customers.csv"
);
const publicUnmatched = build("Unknown <unknown@gmail.com>", publicDomain);
assert.strictEqual(publicUnmatched.identity.matched, false);
assert.strictEqual(publicUnmatched.importance.level, "unrated");

const ambiguousRecords = customerIntel.parseRegistryText(
  "domain,company\nshared.example,One\nshared.example,Two",
  "customers.csv"
);
const ambiguous = build("Buyer <buyer@shared.example>", ambiguousRecords);
assert.strictEqual(ambiguous.identity.ambiguous, true);
assert.strictEqual(ambiguous.importance.level, "unrated");

const conflictRecords = customerIntel.parseRegistryText(
  [
    "email,domain,company",
    "person@conflict.example,other.example,Email Owner",
    "second@another.example,conflict.example,Domain Owner"
  ].join("\n"),
  "customers.csv"
);
const conflict = build("Person <person@conflict.example>", conflictRecords);
assert.strictEqual(conflict.identity.ambiguous, true);
assert.strictEqual(conflict.identity.matchType, "conflict");

const outbound = build(
  "Sales <sales@our-company.com>",
  records,
  ["Buyer <buyer@example-industrial.com>"]
);
assert.strictEqual(outbound.identity.matchType, "email");

const multipleOutbound = build(
  "Sales <sales@our-company.com>",
  [],
  ["One <one@first-customer.example>", "Two <two@second-customer.example>"]
);
assert.strictEqual(multipleOutbound.identity.ambiguous, true);
assert.strictEqual(multipleOutbound.importance.level, "unrated");

assert.strictEqual(customerIntel.validateDingTalkUrl("javascript:alert(1)").status, "invalid");
assert.strictEqual(customerIntel.validateDingTalkUrl("dingtalk:javascript:alert(1)").status, "invalid");
assert.strictEqual(customerIntel.validateDingTalkUrl("dingtalk://evil.example/open").status, "invalid");
assert.strictEqual(customerIntel.validateDingTalkUrl("https://example.com/fake").status, "invalid");
assert.strictEqual(customerIntel.validateDingTalkUrl("https://docs.dingtalk.com/i/nodes/example").status, "available");

console.log("customer-intelligence-regression: ok");
