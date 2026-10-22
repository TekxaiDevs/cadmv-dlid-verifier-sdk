# cadmv-dlid-verifier-sdk ChangeLog

## 1.0.0 - 2026-xx-xx

### Notes
- Initial release.
- See git history for changes previous to this release.

### Added
- Add core files.

### Fixed
- Preserve underlying Bitstring Status List errors instead of replacing every
  status-check failure with `"credentialStatus" property not found.`
- Treat a set revocation status bit as invalid (`valid: false`).
- Bound remote document fetches with a timeout so unavailable hosts fail
  closed instead of hanging.
- Ignore `_test` options outside test environments so callers cannot weaken
  status-list verification in production.
- Fail closed when a successful status-check response omits `results`.
- Validate `TerseBitstringStatusListEntry` base URL and index before lookup.
- Make `npm test` run `vitest run` (CI-safe); add `test:watch` for local use.
- Add optional client fixture tests: `Cali-1.raw` (real prod) and
  `Cali-Fake.raw` (physically fake ID; measured outcome still crypto+status
  `valid: true`), including string/Uint8Array/Buffer parity and
  reject-prod-in-uat mode isolation.
- Add Buffer→Uint8Array DAJ regression and empty-Buffer fail-closed coverage.
- Add deterministic tampering tests (optical field / VCB proof mutation →
  `Invalid signature.`; early VCB corruption → decode failure; DAJ change →
  issuer rejection) on the public UAT example without mocking crypto.
- Document that `valid: true` is barcode/crypto/status validity only — not
  physical-card authenticity.
- Document that revocation vs status-list load failures are distinguished via
  `error.cause` (no in-repo integer result-code API); add acceptance audit.
- Normalize scanner input at the `verify()` boundary by retaining content from
  the first AAMVA `@` compliance indicator (client-confirmed wrapper strip).
- Fail closed on PDF417 decode errors (e.g. null `data`) instead of throwing;
  harden binary view handling in input normalization.
- Coerce Node.js `Buffer` inputs to plain `Uint8Array` so AAMVA decode works
  for file/scanner byte buffers.
- Repair common AAMVA text-export transport damage (CRLF header/control
  mangling) before decode.
