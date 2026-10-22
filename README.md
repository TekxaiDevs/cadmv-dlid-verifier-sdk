# Verify California Driver's Licenses and Identity Cards

> A JavaScript library to verify California Department of Motor Vehicle
> (CA DMV) Driver's Licenses and Identification Cards.

Press release: [DMV to Releases New California Driver’s License and Identification Card Design with Advanced Security Features](https://www.dmv.ca.gov/portal/news-and-media/dmv-to-release-new-california-drivers-license-and-identification-card-design-with-advanced-security-features/)

Public Website: [The California Driver's License Digital Signature](https://www.dmv.ca.gov/portal/driver-licenses-identification-cards/digital-signature/)

Documentation: [Verifying Digital Signatures on California DL/ID Documents](https://www.dmv.ca.gov/portal/file/verifying-digital-signatures-on-california-dlid-documents-pdf/)

## Table of Contents

- [Features](#features)
- [Install](#install)
- [Requirements](#requirements)
- [Usage](#usage)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Contribute](#contribute)
- [Commercial Support](#commercial-support)
- [License](#license)

## Features

This library provides an API for Web browsers and Node.js to verify CA DMV
DL/ID PDF417 [Verifiable Credential Barcodes][] data.

- Designed to handle the VCB data on current California Drivers Licenses and IDs.
- Restricts the resources that can be loaded during verification to those hosted by CA DMV.

## Install

### NPM

```sh
npm install cadmv-dlid/verifier-sdk
```

### Git

To install locally for development:

```sh
git clone https://github.com/stateofca/cadmv-dlid-verifier-sdk.git
cd cadmv-dlid-verifier-sdk
npm install
```

## Requirements

- Node.js 20+ (developed and tested with Node.js 20)

## Usage

Once PDF417 data has been scanned, the string or bytes can be sent to the
`verify` function. This function will check for
[Verifiable Credential Barcodes][] data and perform verification.

AAMVA PDF417 barcode content begins with the compliance indicator `@`.
Some scanners prepend non-barcode metadata (for example a `ParserVer` line
and timestamp) before that payload. Per client confirmation, that prefix may
be stripped: `verify()` normalizes string and byte inputs by retaining only
the portion starting at the first `@` (bytes after that boundary are not
re-encoded). Payloads that already start with `@` are unchanged. If `@` is
not present, the input is left as-is and verification fails closed through
the normal decode path. Scanner metadata must not contain `@` before the
barcode; the first `@` marks the start of the payload. After `@`, AAMVA
PDF417 data typically continues with LF, RS (`0x1e`), and CR before the
`ANSI` header. Prefer binary captures; common text-export damage
(`@\r\n\x1e\r\nANSI`, `@\n\x1e\nANSI`, CRLF field separators, LF before
`ZCZC`) is repaired when recognized.

Node.js `Buffer` values are accepted and coerced to a plain `Uint8Array`
before decode (required for correct field parsing).

The main function of this library is `async verify(options)`.

Basic usage:

```js
import {verify} from 'cadmv-dlid-verifier-sdk';
const result = await verify({
  data: scannedPdf417Data
});
if(result.valid) {
  // data valid
} else {
  // not valid, handle result.error if needed
}
```

Force VCB data to be required:

```js
import {verify} from 'cadmv-dlid-verifier-sdk';
const result = await verify({
  data: scannedPdf417Data,
  requireVcb: true
});
```

Enable VCB revocation status verification:

```js
import {verify} from 'cadmv-dlid-verifier-sdk';
const result = await verify({
  data: scannedPdf417Data,
  mode: 'uat', // or 'prod' (default)
  verifyStatus: true
});
```

When `verifyStatus` is `true`, the SDK converts a
`TerseBitstringStatusListEntry` into a Bitstring Status List lookup and
fetches the corresponding status-list credential from the CA DMV status
API hosts allowed for the selected `mode`. Status verification fails closed:

- Missing `credentialStatus` → not valid
- Status list unavailable / network or HTTP errors → not valid
- Status-list credential proof or issuer mismatch → not valid
- Status purpose mismatch → not valid
- Revocation bit set → not valid

A network or status-list loading failure is **not** treated as proof that a
credential is unrevoked. The returned `error` (and `error.cause` when present)
preserves the underlying failure reason.

Both revocation and status-list infrastructure failures yield `valid: false`
with `error.message` of `Status error`. Distinguish them with
`error.cause.message`, for example:

- Revoked: `Credential status indicates revocation.`
- Status list unavailable: message matching
  `Could not load "BitstringStatusListCredential"`

This repository’s public API is the `{valid, error, debug}` object above. It
does **not** define integer result codes (`1` / `0` / `2` / `10`). If an
integrator contract requires those codes, map them outside this SDK after
inspecting `valid` and `error.cause`.

Available options:

- `{Uint8Array|string}` `options.data` - PDF417 bytes or string.
- `{string}` `[options.encoding='utf8']` - String encoding if `data` is a
  string.
- `{boolean}` `[options.requireVcb=false]` - `true` to require VCB data be
  present.
- `{boolean}` `[options.verifyStatus=false]` - `true` to check VCB revocation
  status.
- `{Function}` `[options.documentLoader=null]` - Override default
  `documentLoader`.
- `{string}` `[options.mode='prod']` - Target deployment: `'prod'` or `'uat'`.
- `{boolean}` `[options.debug=false]` - `true` to return debug details.
  Properties are informative only and subject to change.

Returns object with fields:

- `valid`: `true` if data is valid.
- `error`: Error details if data is not valid. Cryptographic failures use
  message `Verify error`; status-check failures use `Status error`. Inspect
  `error.cause` for the underlying reason.
- `debug`: Debug details object if requested.

### Modes

- `prod` (default): loads DID and status resources from
  `credentials.dmv.ca.gov` / `api.credentials.dmv.ca.gov`.
- `uat`: loads DID and status resources from
  `uat-credentials.dmv.ca.gov` / `api.uat-credentials.dmv.ca.gov`.

UAT examples in the CA DMV technical overview use UAT hosts; production
barcodes must be verified with `mode: 'prod'`.

## Testing

```sh
npm test
# equivalent:
npx vitest run
npm run lint
# watch mode during development:
npm run test:watch
```

Some tests contact CA DMV UAT DID documents over the network. Status-list
happy-path and revocation-bit tests use in-memory fixtures so they do not
depend on live status-list availability. Internal `_test` options are honored
only when `VITEST=true` or `NODE_ENV=test`.

### Known external dependency: status lists

URL construction for `TerseBitstringStatusListEntry` follows the CA DMV
technical overview and vc-barcodes conversion:

`{terseStatusListBaseUrl}/revocation/{floor(index / 2^26)}`

For the published **UAT** documentation example
(`terseStatusListIndex` `3866524935`), that is:

`https://api.uat-credentials.dmv.ca.gov/status/dlid/1/status-lists/revocation/57`

That UAT URL has been observed returning **HTTP 404**, while the UAT DID
document remains reachable. With `verifyStatus: true` on that example, the
SDK fails closed and preserves the load error.

Optional local client captures (untracked; place at the repository root to
enable fixture tests):

- `Cali-1.raw` — **real** production DL/ID barcode. `mode: 'prod'` with
  `verifyStatus: true` succeeds; rejected in `mode: 'uat'`.
- `Cali-Fake.raw` — barcode from a **physically fake** ID. Measured
  outcome: cryptographic proof and status checks still succeed
  (`valid: true`). That is a documented limitation of barcode-only
  verification, **not** a reason to weaken cryptographic checks. This SDK
  verifies the barcode payload and status list, not card-stock authenticity.
  Do not treat “fake” in the filename as `Invalid signature` unless
  verification actually reports that error.

Both use `did:web:credentials.dmv.ca.gov` and prod status-list hosts.
Text-export transport damage (CRLF / mangled AAMVA header control bytes)
is repaired at the `verify()` boundary when possible. Cryptographic
invalidity is covered by the published UAT invalid example in tests, not
by `Cali-Fake.raw`.

## Troubleshooting

- `URL not allowed`: credential hosts do not match the selected `mode`
  (for example, verifying a UAT barcode with default `prod` mode).
- `Status error` with cause mentioning
  `Could not load "BitstringStatusListCredential"`: the status-list URL
  could not be fetched (HTTP error, timeout, or host policy). The credential
  is not treated as valid.
- `Credential status indicates revocation.`: the status bit for the
  credential is set.
- `Verify error` with `Invalid signature.`: cryptographic verification of
  the VCB failed.

### What `valid: true` means (and does not mean)

When `verify()` returns `valid: true`, the SDK has determined that the
**barcode payload** passed the checks it implements for the selected options
and `mode`, typically including:

- AAMVA decode and California issuer / DAJ checks
- VCB decode and **cryptographic** proof verification (ecdsa-xi-2023 with
  optical document hash)
- Host allowlists for DID / status resources
- When `verifyStatus: true`, status-list fetch and revocation-bit evaluation

`valid: true` does **not** mean:

- The physical card stock is genuine or non-counterfeit
- A human visually inspected the card
- DMV has attested physical-card authenticity via a separate channel

A physically fake card can still carry a barcode whose VCB proof verifies
(for example a cloned or reprinted payload that remains cryptographically
valid and unrevoked). This SDK has **no** authoritative DMV signal that
identifies physical-card counterfeits independent of the barcode. Detecting
that would require additional trusted capability (for example a DMV
card-to-barcode binding service, secure element attestation, or physical
security-feature inspection) outside this library’s API.

This library verifies barcode payloads according to the published CA DMV
technical overview and related open specifications. It does not claim
official CA DMV certification or endorsement.

For JS API readiness versus UAT/status, Xamarin/Android hosting, and
physical-card scope boundaries, see `ACCEPTANCE_AUDIT.md` §7
(Release-readiness). That document does **not** constitute full client
acceptance or production release approval.

## Integer result codes (Xamarin Option A)

Hosts that need `1` / `0` / `2` / `10` should use the thin coded API (Node),
not Jint:

```js
import {verifyWithCode, RESULT_CODES} from 'cadmv-dlid-verifier-sdk';

const {code} = await verifyWithCode({
  data: scannedPdf417Data,
  mode: 'prod',
  online: true,          // false → 10 without calling crypto
  verifyStatus: true     // default true so revoked can map to 2
});
// RESULT_CODES.VALID (1) | INVALID (0) | REVOKED (2) | OFFLINE (10)
```

Pre-gate helper (issue date ≥ 2025-09-29 and/or VCB present):

```js
import {inspectBarcodeGate} from 'cadmv-dlid-verifier-sdk';
const gate = await inspectBarcodeGate({data: scannedPdf417Data});
if(gate.shouldVerify) {
  // call verifyWithCode / HTTP service
}
```

Run the local HTTP service for C# / Xamarin:

```sh
npm run service
# POST http://127.0.0.1:8787/v1/verify
```

Sample C# client and gate: [`integration/`](./integration/). Full crypto
runs in Node; the Android app only checks connectivity, applies the gate,
and maps the returned integer code.

## Contribute

Please follow the existing code style. Pull requests are accepted.

If editing the README, please conform to the
[standard-readme](https://github.com/RichardLitt/standard-readme) specification.

## Commercial Support

Commercial support for this library is available upon request from
Digital Bazaar: support@digitalbazaar.com

## License

[BSD-3-Clause](LICENSE) © Digital Bazaar

[Verifiable Credential Barcodes]: https://w3c-ccg.github.io/vc-barcodes/
