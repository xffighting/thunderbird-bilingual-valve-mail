# Contributing

## Development

1. Install Node.js 20 or newer.
2. Run `npm install`.
3. Run `npm test`.
4. Run `npm run test:ui`.

Native-host regression:

```bash
PYTHONPATH=native-host python3 native-host/translation_quality_regression.py
python3 native-host/native_protocol_regression.py
```

## Privacy rules

- Never commit real email bodies, attachments, contacts, addresses, prices,
  quotations, contracts, mailbox paths, access tokens, or screenshots that
  contain customer information.
- Use synthetic examples under reserved domains such as `example.test`.
- Local mailbox audit scripts and generated audit output must remain ignored.
- The extension must remain read-only and must not request message-modification
  permissions.

## Versioning

- Use Semantic Versioning.
- Add a human-readable entry to `CHANGELOG.md`.
- Run all tests before committing.
- Tag releases as `vMAJOR.MINOR.PATCH`.
