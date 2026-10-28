# Test matrix — iCA DL/ID Barcode Verifier

Codes: **1** valid · **0** invalid · **2** revoked · **10** offline

## Automated (Node wrapper) — run `cd bridge/js && npm test`

| # | Case | Mode / flags | Expected | Result |
|---|------|--------------|----------|--------|
| T1 | Empty Base64 | — | 0 | **PASS** |
| T2 | Malformed Base64 | — | 0 | **PASS** |
| T3 | Bogus payload | `uat` | 0 | **PASS** |
| T4 | Invalid UAT signature | `uat`, `skipStatus` | 0 | **PASS** (live DID) |
| T5 | Valid UAT crypto | `uat`, `skipStatus` | 1 | **PASS** (live DID) |
| T6 | Valid UAT + status | `uat`, two-pass | 10 or 1 | **PASS** (UAT lists often 404 → 10) |

SDK Vitest suite (`npm test` at repo root) covers additional decode,
tamper, and mocked-revocation (**2**) cases.

## On-device / emulator (VS2022 demo)

Run [`../android/Cadmv.DlidVerifier.Demo.sln`](../android/Cadmv.DlidVerifier.Demo.sln).
Requires network to DMV hosts unless testing offline.

| # | Case | Steps | Expected | Result |
|---|------|-------|----------|--------|
| D1 | Valid UAT → 1 | **UAT Valid** (auto UAT on + Skip status ON), Verify | 1 | *Pending device* |
| D2 | Invalid UAT → 0 | **UAT Invalid**, same flags | 0 | *Pending device* |
| D3 | Empty → 0 | Clear, Verify | 0 | *Pending device* |
| D4 | Offline → 10 | Airplane mode, Verify any payload | 10 | *Pending device* |
| D5 | Prod + status | **Prod Real** (`Cali-1.raw`; auto UAT off + Skip OFF) | 1 | Fixture in demo assets |
| D6 | Malformed paste | Random text | 0 | *Pending device* |
| D7 | Two-pass revoked | Fixture with revocation bit (mock or live) | 2 | Covered in SDK Vitest mocks; *pending device* |
| D8 | DMV unreachable | Valid crypto path with network blocked mid-fetch | 10 | *Pending device* |

### First on-device proof (required)

Sandbox environments often block DMV hosts. The first device run **must**
confirm **D1** (valid UAT with skip-status → **1**) to prove WebView
`crypto.subtle` + AssetLoader + live DID fetch work together.

### UAT status-list gap

Published UAT status URL for the docs example has been observed as **HTTP 404**.
Full two-pass on that sample therefore returns **10**, not **1**. Use:

- **D1** (`skipStatus`) to prove crypto on device, and/or  
- **D5** prod barcode + live prod status lists for end-to-end **1**.

Product default remains `prod` + two-pass (`skipStatus: false`).

## Scope check

| Assertion | True when code = 1? |
|-----------|---------------------|
| Barcode crypto OK for mode | Yes |
| Not revoked (if status on) | Yes |
| Physical card genuine | **No** — always out of scope |

Record device results above when available; keep this file updated for handover.
