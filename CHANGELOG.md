# Changelog

All notable changes follow [Semantic Versioning](https://semver.org/).

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
