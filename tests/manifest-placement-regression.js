const assert = require("assert");
const fs = require("fs");
const path = require("path");

const manifestPath = path.join(__dirname, "..", "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const background = fs.readFileSync(path.join(__dirname, "..", "src", "background.js"), "utf8");
const nativeInstaller = fs.readFileSync(
  path.join(__dirname, "..", "native-host", "install_macos.sh"),
  "utf8"
);

assert.strictEqual(manifest.version, "0.5.2");
assert.ok(manifest.action, "The add-on should keep the main Thunderbird toolbar button.");
assert.ok(manifest.action.default_title.length <= 8, "Keep the main toolbar title short.");
assert.ok(
  manifest.permissions.includes("messagesRead") && manifest.permissions.includes("scripting"),
  "The add-on should use the Thunderbird 128+ scripting.messageDisplay API."
);
assert.ok(
  manifest.permissions.includes("nativeMessaging"),
  "Offline translation should use a local native host instead of a remote translation API."
);
assert.ok(
  !manifest.permissions.includes("messagesModify"),
  "The read-only add-on should not request message modification access."
);
assert.ok(!manifest.message_display_scripts, "Do not use the TB151-only manifest property when supporting TB128.");
assert.ok(!manifest.message_display_action, "Do not place the add-on near Reply/Archive/Delete.");
assert.deepStrictEqual(
  manifest.background.scripts,
  [
    "src/customer-intelligence.js",
    "src/summary.js",
    "src/translation-native.js",
    "src/background.js"
  ]
);

for (const filePath of [
  "ui/message-summary-button.js",
  "ui/message-summary-button.css",
  "ui/inline-translation.js",
  "ui/inline-translation.css",
  "src/inline-translation-core.js"
]) {
  assert.ok(
    fs.existsSync(path.join(__dirname, "..", filePath)),
    `${filePath} should exist for the inline message-view fallback.`
  );
}

assert.ok(
  background.includes("getSummaryForDisplayedMessage"),
  "The inline button should request the summary for the displayed message tab."
);
assert.ok(background.includes("getDisplayedMessages"), "Use the Manifest V3 message display API.");
assert.ok(background.includes("onMessagesDisplayed"), "Use the Manifest V3 message display event.");
assert.ok(background.includes("scripting.messageDisplay.registerScripts"), "Register the inline script on TB128+.");
assert.ok(background.includes("scripting.executeScript"), "Inject the inline entry into already-open message tabs.");
assert.ok(!manifest.permissions.includes("tabs"), "Do not request broad tab metadata access.");
assert.ok(
  fs.existsSync(path.join(__dirname, "..", "native-host", "valve_glossary.json")),
  "The offline translator should ship with the Lianggu valve glossary."
);
assert.ok(
  nativeInstaller.includes('cp "${SOURCE_DIR}/valve_glossary.json" "${APP_DIR}/valve_glossary.json"'),
  "The macOS installer should install the valve glossary next to the native host."
);

console.log("manifest-placement-regression: ok");
