const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.setContent(`
    <!doctype html>
    <html>
      <body>
        <div id="mail">
          Please quote your best price.<br>
          Delivery is required within four weeks.
        </div>
        <p id="technical">DN50 PN16 WCB RFQ-100</p>
        <p id="already-zh">这是一行中文，不需要重复翻译。</p>
        <pre id="forwarded-header">From: sender@example.test
Sent: Monday, July 27, 2026 3:24 PM
To: buyer@example.test
Subject: Re: RFQ-100</pre>
        <p id="bad-output">Please confirm the attached commercial offer.</p>
        <pre id="plain-text">Please confirm the required quantity.
The material shall be stainless steel.</pre>
        <p id="russian">Просим предоставить цену на шаровой кран DN50 PN16.</p>
      </body>
    </html>
  `);

  await page.evaluate(() => {
    globalThis.browser = {
      runtime: {
        sendMessage: async request => {
          if (request.type === "getOptions") {
            return {
              inlineTranslationEnabled: true,
              inlineTranslationIncludeQuoted: false
            };
          }
          if (request.type === "translateInlineBatch") {
            return {
              ok: true,
              translations: request.texts.map(text => {
                if (text.includes("best price")) return "请提供最优价格。";
                if (text.includes("four weeks")) return "要求在四周内交货。";
                if (text.includes("required quantity")) return "请确认所需数量。";
                if (text.includes("stainless steel")) return "材质应为不锈钢。";
                if (text.includes("commercial offer")) return "鹰嘴".repeat(80);
                if (text.includes("шаровой кран")) return "请提供球阀 DN50 PN16 的报价。";
                return text;
              })
            };
          }
          throw new Error(`Unexpected request: ${request.type}`);
        }
      }
    };
  });

  await page.addScriptTag({
    path: path.join(__dirname, "..", "src", "inline-translation-core.js")
  });
  await page.addStyleTag({
    path: path.join(__dirname, "..", "ui", "inline-translation.css")
  });
  await page.addScriptTag({
    path: path.join(__dirname, "..", "ui", "inline-translation.js")
  });

  await page.waitForSelector(".gms-inline-translation");

  const mailLines = await page.locator("#mail").innerText();
  assert.deepStrictEqual(
    mailLines.split("\n").map(line => line.trim()).filter(Boolean),
    [
      "Please quote your best price.",
      "请提供最优价格。",
      "Delivery is required within four weeks.",
      "要求在四周内交货。"
    ],
    "each translated line should appear directly below its English source"
  );

  assert.strictEqual(
    await page.locator("#technical .gms-inline-translation").count(),
    0,
    "technical identifiers should not receive a duplicate row"
  );
  assert.strictEqual(
    await page.locator("#already-zh .gms-inline-translation").count(),
    0,
    "Chinese lines should not receive a duplicate row"
  );
  assert.strictEqual(
    await page.locator("#forwarded-header .gms-inline-translation").count(),
    0,
    "forwarded email headers should never be translated"
  );
  assert.strictEqual(
    await page.locator("#bad-output .gms-inline-translation").count(),
    0,
    "repetitive garbage output should be suppressed"
  );

  const plainTextLines = await page.locator("#plain-text").innerText();
  assert.deepStrictEqual(
    plainTextLines.split("\n").map(line => line.trim()).filter(Boolean),
    [
      "Please confirm the required quantity.",
      "请确认所需数量。",
      "The material shall be stainless steel.",
      "材质应为不锈钢。"
    ],
    "plain-text Thunderbird messages should also be translated line by line"
  );

  assert.deepStrictEqual(
    (await page.locator("#russian").innerText())
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean),
    [
      "Просим предоставить цену на шаровой кран DN50 PN16.",
      "请提供球阀 DN50 PN16 的报价。"
    ],
    "Russian mail should be translated into Chinese below the source line"
  );

  const translationStyle = await page.locator(".gms-inline-translation").first().evaluate(node => {
    const style = getComputedStyle(node);
    return {
      display: style.display,
      marginTop: style.marginTop,
      marginBottom: style.marginBottom,
      paddingLeft: style.paddingLeft,
      borderLeftWidth: style.borderLeftWidth,
      color: style.color
    };
  });
  assert.deepStrictEqual(
    translationStyle,
    {
      display: "inline-block",
      marginTop: "2px",
      marginBottom: "5px",
      paddingLeft: "9px",
      borderLeftWidth: "2px",
      color: "rgb(73, 103, 125)"
    },
    "translations should use a quiet, readable visual hierarchy"
  );

  assert.strictEqual(
    await page.locator(".gms-inline-feedback-button").count(),
    0,
    "translated rows should not add a correction button to every line"
  );
  assert.strictEqual(
    await page.locator("#gms-translation-feedback-dialog").count(),
    0,
    "the message view should not create a per-line correction dialog"
  );

  const artifactDir = path.join(__dirname, ".artifacts");
  fs.mkdirSync(artifactDir, { recursive: true });
  await page.screenshot({
    path: path.join(artifactDir, "inline-translation.png"),
    fullPage: true
  });

  await page.locator("#gms-inline-translation-toggle").click();
  assert.strictEqual(
    await page.locator(".gms-inline-translation").first().isVisible(),
    false,
    "the bilingual rows should be hideable without changing the original email"
  );

  await browser.close();
  console.log("inline translation browser regression passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
  process.exit();
});
