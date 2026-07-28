const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const sandbox = { console, URL };
sandbox.globalThis = sandbox;

for (const relativePath of ["src/customer-intelligence.js", "src/summary.js"]) {
  let source = fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
  if (relativePath === "src/summary.js") {
    source = source.replace(
      "global.GameMailSummary = {",
      "global.GameMailSummary = { summarizeEntries, "
    );
  }
  vm.runInNewContext(source, sandbox, { filename: relativePath });
}

const options = {
  keyPointLimit: 12,
  ownDomains: ["chlgvalve.com", "cnlgvalve.com"],
  ownEmails: [],
  customerRecords: []
};

function summarize(subject, body, id = 1) {
  const header = {
    id,
    subject,
    author: "Buyer <buyer@example-industrial.test>",
    recipients: ["Sales <sales@chlgvalve.com>"],
    ccList: [],
    date: "2026-07-24T01:00:00Z"
  };
  return sandbox.GameMailSummary.summarizeEntries(
    header,
    [{ header, body }],
    options
  );
}

const fileNameNoise = summarize(
  "RE: KUWAIT ACWA PROJECT P3077",
  "Please open the files. HAWKS ENGINEERING CO., LTD. 提供文件.rar"
);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(fileNameNoise.inquiry.quantity)),
  [],
  "The Chinese character in 文件 must not be treated as a quantity unit."
);
assert.strictEqual(fileNameNoise.projectNames.length, 1);
assert.ok(fileNameNoise.projectNames[0].includes("P3077"));

const choke = summarize(
  "Manual adjustable Angle Choke Valve PFT-2026-123",
  [
    "Please quote the following item.",
    "Manual adjustable Angle Choke valve - 3 no's",
    "Size: 1-1/2\" x 300LB RF x 3\" x 300LB RF",
    "Body: A216Gr.WCB. Seat: 316 SS + PTFE.",
    "Please provide a techno commercial offer."
  ].join("\n"),
  2
);
assert.ok(choke.productCategories.some(value => value.includes("Choke valve")));
assert.ok(choke.inquiry.quantity.some(value => value.includes("3")));
assert.ok(choke.inquiry.specifications.sizes.some(value => value.includes("1-1/2")));
assert.ok(choke.inquiry.specifications.pressureRatings.some(value => value.includes("300")));
assert.ok(choke.inquiry.specifications.materials.some(value => /WCB/iu.test(value)));
assert.ok(!/[\u3400-\u9fff]/u.test(choke.brief.inquiry.en));

const marketing = summarize(
  "Electric Actuated Valves",
  "We have a market study and can provide a sample report covering key companies."
);
assert.strictEqual(marketing.messageTriage.category, "noise");
assert.strictEqual(marketing.inquiry.status, "not_inquiry");
assert.strictEqual(marketing.inquiry.missingCriticalFields.length, 0);
assert.ok(marketing.brief.inquiry.en.startsWith("Not an RFQ"));
assert.strictEqual(marketing.projectNames.length, 0);

const receipt = summarize(
  "已读：Re: ITP resubmission: Re: PO-MC-032-26",
  "收件人在2026-06-18阅读了您发送的主题邮件",
  3
);
assert.strictEqual(receipt.messageTriage.category, "receipt");
assert.strictEqual(receipt.inquiry.missingCriticalFields.length, 0);
assert.ok(receipt.brief.inquiry.en.includes("read receipt"));

const orderFollowUp = summarize(
  "Re: ITP resubmission: Re: PO-MC-032-26",
  [
    "We had a discussion with the client regarding the witness point.",
    "Please keep the additional witness points as Review points.",
    "The existing order includes globe valves.",
    "Refer to project scope and requirements."
  ].join("\n"),
  4
);
assert.strictEqual(orderFollowUp.messageTriage.category, "order_follow_up");
assert.strictEqual(orderFollowUp.inquiry.missingCriticalFields.length, 0);
assert.ok(!orderFollowUp.projectNames.some(value => /scope|requirements/iu.test(value)));
assert.ok(orderFollowUp.brief.inquiry.en.startsWith("Order/technical follow-up"));

const explicitProject = summarize(
  "RELA_P83P5292_Ta’ziz Logistic_RFQ for MOV||Chilled water Package_LIANGGU",
  [
    "Project Name: Ta’ziz Logistic Project – Terminal Package – EPC Works",
    "End User: ADNOC",
    "Please quote MOV for the chilled water package.",
    "The actuator must be Rotork."
  ].join("\n"),
  5
);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(explicitProject.projectNames)),
  ["Ta’ziz Logistic Project – Terminal Package – EPC Works"]
);
assert.ok(explicitProject.productCategories.some(value => value.includes("Motor-operated valve")));
assert.ok(!explicitProject.inquiry.specifications.materials.some(value => /data sheet/iu.test(value)));

const safetyValve = summarize(
  "REQUETS SAFETY VALVE",
  [
    "Please quote safety valve, cast steel A216Gr.WCB, airtight flange.",
    "Size: 1-1/2\" x 300LB RF x 3\" x 300LB RF.",
    "Set pressure: 16.2 m/c². Q'ty: 1 PC."
  ].join("\n"),
  6
);
assert.ok(safetyValve.productCategories.some(value => value.includes("Safety relief valve")));
assert.ok(!safetyValve.productCategories.some(value => value.includes("Flange and fittings")));
assert.ok(safetyValve.inquiry.specifications.pressureRatings.some(value => value.includes("16.2")));

console.log("live-pattern-regression: ok");
