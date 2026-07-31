const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const context = { globalThis: {} };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, "../src/customer-research.js"), "utf8"),
  context
);

const completeRfq = context.CustomerResearch.scoreInquiry({
  messageTriage: { category: "rfq", actionableInquiry: true },
  productCategories: ["球阀 / Ball valve"],
  inquiry: {
    categories: ["球阀 / Ball valve"],
    quantity: ["12 pcs"],
    specifications: {
      sizes: ["DN50"],
      pressureRatings: ["Class 300"],
      materials: ["WCB"],
      standards: ["API 6D"]
    },
    commercial: { leadTimes: ["6 weeks"], deliveryTerms: ["FOB"], paymentTerms: [] },
    requestedDocuments: ["MTC"],
    missingCriticalFields: []
  },
  project: { status: "inferred", confidence: "high", confirmedName: "ACME Project" }
});

assert.ok(completeRfq.score >= 80, "A parameter-rich RFQ should score as high quality.");
assert.strictEqual(completeRfq.band, "high");

const incompleteRfq = context.CustomerResearch.scoreInquiry({
  messageTriage: { category: "rfq", actionableInquiry: true },
  inquiry: {
    categories: ["阀门 / Valve"],
    quantity: [],
    specifications: { sizes: [], pressureRatings: [], materials: [] },
    commercial: {},
    missingCriticalFields: [
      { field: "quantity", labelZh: "数量" },
      { field: "size", labelZh: "口径" },
      { field: "pressure", labelZh: "压力" },
      { field: "material", labelZh: "材质" }
    ]
  },
  project: { status: "missing", confidence: "low" }
});
assert.ok(incompleteRfq.score < completeRfq.score);
assert.deepStrictEqual(
  Array.from(incompleteRfq.missing),
  ["数量", "口径", "压力", "材质"]
);

const noise = context.CustomerResearch.scoreInquiry({
  messageTriage: { category: "noise", actionableInquiry: false }
});
assert.strictEqual(noise.score, 0);
assert.strictEqual(noise.band, "not-inquiry");

const exactMatch = context.CustomerResearch.customerMatch({
  dingtalk: { status: "matched", matchEvidence: "exact_email" },
  research: { matchScore: 82, matchLabelZh: "高度匹配" }
});
assert.strictEqual(exactMatch.score, 82);
assert.strictEqual(exactMatch.band, "high");

const ambiguous = context.CustomerResearch.customerMatch({
  dingtalk: { status: "review_required" },
  research: { matchScore: 0 }
});
assert.strictEqual(ambiguous.band, "review");

console.log("customer-research-regression: ok");
