# Changelog

All notable changes follow [Semantic Versioning](https://semver.org/).

## [0.7.1] - 2026-07-28

### Added

- Added automatic Russian-line detection and private offline
  Russian-to-English-to-Chinese translation.
- Added 26 Russian valve and foreign-trade terminology rules, including
  standard translations for ball valve, valve body, body material, delivery
  time, and quotation.
- Added English/Russian source-language selection to custom terminology and
  preserved that language through correction approval.

### Fixed

- The correction dialog now closes only after the local background process
  explicitly confirms persistence.
- Failed correction saves keep the dialog open and restore the submit button
  for retry.
- Successful corrections show a visible saved mark, restore focus to the
  source row, and cannot be submitted twice.
- Repeated pending corrections for the same source phrase now update the
  existing local record instead of creating duplicates.
- Removed an unmatched closing element from the correction dialog markup.

### Security

- Russian and English email text remains inside Thunderbird and the local
  Native Messaging host. No cloud translation service is used.

## [0.7.0] - 2026-07-28

### Added

- Added an automatic short-Chinese reply assistant to Thunderbird compose
  windows. It opens a quiet side popup after the writer pauses.
- Added Chinese, English, Russian, and Arabic candidates that share one
  fact-preserving structure and can be inserted into the active draft.
- Added rich-text insertion with bold field labels. Plain-text composers use
  explicit section labels instead.
- Added local Chinese-to-English, English-to-Russian, and English-to-Arabic
  models, with protected valve terms, model numbers, materials, pressure
  classes, and standards.
- Added Russian and Arabic technical-reference anchors so critical English
  valve terms remain visible for final review.
- Added a Settings toggle to turn the automatic compose popup on or off.

### Changed

- Selecting a language replaces only the short draft above the signature and
  quoted history. It does not send the message or alter earlier correspondence.

### Security

- Reply optimization and all four translations run through the local Native
  Messaging host. Draft text is kept in memory and is not uploaded or saved as
  translation history.

## [0.6.0] - 2026-07-28

### Added

- Expanded the built-in valve and export-sales glossary from 54 to 153
  reviewed terms covering valve types, components, structures, inspection,
  certificates, trade documents, and quotation language.
- Added a local custom terminology editor with enable, disable, valve-context,
  and delete controls.
- Added per-line translation correction in the Thunderbird reading view.
  Corrections remain pending locally until approved in Settings.
- Added a six-sample privacy-safe local model benchmark that automatically
  selects the best installed English-to-Chinese model.
- Added responsive macOS-style Settings navigation and search.

### Changed

- Custom terminology now takes priority over the built-in glossary and the
  offline model.
- Translation cache keys now include the active custom terminology so edits
  take effect without stale translations.

### Security

- Model evaluation uses only bundled synthetic phrases and never reads or
  uploads customer email.
- Translation corrections and custom terminology remain in Thunderbird local
  extension storage.

## [0.5.2] - 2026-07-28

### Added

- Added deterministic business terminology for `factory`, `quotation`, common
  quotation-email phrases, and business sign-offs.
- Added translation quality gates for repeated CJK garbage, replacement
  characters, and abnormal output length.

### Fixed

- Prevented forwarded-mail headers such as `From`, `Sent`, `To`, `Cc`, and
  `Subject` from being sent to the translator.
- Removed repeated underscore artifacts produced by the offline model.
- Standardized `quotation` and `quotation sheet` as “报价单”.

## [0.5.1] - 2026-07-28

### Fixed

- Standardized standalone valve specification labels such as `Body`,
  `Body material`, and `Body / Bonnet` as “阀体”.
- Preserved ordinary meanings in phrases such as `human body`.

## [0.5.0] - 2026-07-28

### Added

- Added the local Lianggu valve glossary and protected valve types,
  components, materials, pressure classes, standards, and model identifiers
  before offline translation.
- Added glossary status to the extension settings page.

## [0.4.1] - 2026-07-28

### Changed

- Improved the typography, spacing, and visual hierarchy of inline Chinese
  translations.

## [0.4.0]

### Added

- Added read-only, line-by-line English-to-Chinese translation using a local
  Native Messaging host.
