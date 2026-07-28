const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const sourcePath = path.join(__dirname, "..", "src", "summary.js");
let source = fs.readFileSync(sourcePath, "utf8");

source = source.replace(
  "global.GameMailSummary = {",
  "global.GameMailSummary = { extractOrderStatus, extractStructuredKeyPointGroups, stripContactArtifacts, "
);

const sandbox = { console };
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox, { filename: sourcePath });

const summary = sandbox.GameMailSummary;

function orderItems(text) {
  return summary
    .extractStructuredKeyPointGroups(text, 12)
    .flatMap(group => group.items || [])
    .filter(item => item.id === "orderConfirmed");
}

const falsePositiveCases = [
  "Contact: PO@example.com",
  "Please contact po@example.com.",
  "Portal: https://example.com/po Contact po@example.com",
  "The shared mailbox is po@customer.com.",
  "We have not paid the deposit.",
  "Please do not issue PO before approval.",
  "The purchase order is not confirmed.",
  "订单尚未确认，请不要开具采购订单。",
  "客户尚未付款。"
];

for (const text of falsePositiveCases) {
  assert.notStrictEqual(summary.extractOrderStatus(text).level, "done", text);
  assert.strictEqual(orderItems(text).length, 0, text);
}

const truePositiveCases = [
  "We received PO#A12345 for the DN50 ball valve.",
  "Please arrange production for PO-MC-032-26.",
  "The attached PO confirms the order.",
  "We have issued the purchase order.",
  "The customer has paid the deposit.",
  "订单已确认，请安排生产。"
];

for (const text of truePositiveCases) {
  assert.strictEqual(summary.extractOrderStatus(text).level, "done", text);
  assert.ok(orderItems(text).length >= 1, text);
}

console.log("order-status-regression: ok");
