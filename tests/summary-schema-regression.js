const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const sandbox = { console, URL };
sandbox.globalThis = sandbox;

const customerSource = fs.readFileSync(
  path.join(__dirname, "..", "src", "customer-intelligence.js"),
  "utf8"
);
vm.runInNewContext(customerSource, sandbox, { filename: "customer-intelligence.js" });

let summarySource = fs.readFileSync(path.join(__dirname, "..", "src", "summary.js"), "utf8");
summarySource = summarySource.replace(
  "global.GameMailSummary = {",
  "global.GameMailSummary = { summarizeEntries, buildInquiryInfo, buildProjectInfo, "
);
vm.runInNewContext(summarySource, sandbox, { filename: "summary.js" });

const header = {
  id: 101,
  subject: "RFQ - Project Alpha Expansion",
  author: "Alex Buyer <buyer@example-industrial.com>",
  recipients: ["Sales <sales@our-company.com>"],
  ccList: [],
  date: "2026-07-24T01:00:00Z"
};
const entries = [{
  header,
  body: [
    "Project Name: Alpha Expansion",
    "Please quote 100 pcs ball valve.",
    "Size: DN50, Pressure: PN16, Material: WCB, Connection: flanged.",
    "Delivery: 4 weeks. FOB Shanghai."
  ].join("\n")
}];
const options = {
  keyPointLimit: 12,
  ownDomains: ["our-company.com"],
  customerRecords: [{
    email: "buyer@example-industrial.com",
    company: "Example Industrial",
    grade: "A",
    order_count: 3,
    background_zh: "长期工业客户",
    background_en: "Long-term industrial customer",
    dingtalk_url: "https://docs.dingtalk.com/i/nodes/example"
  }]
};

const result = sandbox.GameMailSummary.summarizeEntries(header, entries, options);
assert.strictEqual(result.schemaVersion, 3);
assert.ok(result.brief.inquiry.zh.includes("球阀"));
assert.ok(result.brief.inquiry.en.toLowerCase().includes("ball valve"));
assert.ok(result.inquiry.quantity.length >= 1);
assert.ok(result.inquiry.specifications.sizes.some(value => /DN\s*50/iu.test(value)));
assert.ok(result.inquiry.specifications.pressureRatings.some(value => /PN\s*16/iu.test(value)));
assert.ok(result.project.nameCandidates.length >= 1);
assert.strictEqual(result.customer.identity.matchType, "email");
assert.strictEqual(result.customer.importance.level, "A");
assert.strictEqual(result.customer.dingtalk.status, "available");
assert.ok(Array.isArray(result.quality.warnings));

const weakProject = sandbox.GameMailSummary.buildProjectInfo([], "RFQ gate valve");
assert.strictEqual(weakProject.status, "missing");
assert.strictEqual(weakProject.confirmedName, null);

const chineseHeader = {
  ...header,
  id: 202,
  subject: "询价 - 海水淡化项目",
  author: "客户 <buyer@example-industrial.com>"
};
const chineseResult = sandbox.GameMailSummary.summarizeEntries(chineseHeader, [{
  header: chineseHeader,
  body: [
    "项目名称：海水淡化项目",
    "请报价球阀10台。",
    "口径DN50，压力PN16，材质不锈钢。",
    "交期要求四周内，付款30%预付款。"
  ].join("\n")
}], options);
assert.ok(!chineseResult.projectNames.some(value => value.startsWith("Subject:")), "Project extraction must not consume the synthetic Subject line.");
assert.ok(chineseResult.brief.project.en.toLowerCase().includes("seawater desalination project"), chineseResult.brief.project.en);
assert.ok(!/[\u3400-\u9fff]/u.test(chineseResult.brief.inquiry.en), chineseResult.brief.inquiry.en);
assert.ok(chineseResult.brief.inquiry.en.includes("10 units"), chineseResult.brief.inquiry.en);
assert.ok(chineseResult.brief.inquiry.en.includes("stainless steel"), chineseResult.brief.inquiry.en);

console.log("summary-schema-regression: ok");
