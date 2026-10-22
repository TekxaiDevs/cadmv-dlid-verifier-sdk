# Acceptance Audit — cadmv-dlid-verifier-sdk

**Date:** 2026-10-23
**Scope:** This repository only (`cadmv-dlid-verifier-sdk`).
**Method:** Live `verify()` runs against local fixtures and public UAT
examples; code review of cryptographic / status sequence; repository search
for integer-code and Xamarin deliverables.

**Safety:** No commits, pushes, deployments, fixture modifications, or
weakening of cryptographic verification. No barcode PII printed.

---

## 0. Baseline commands (this run)

| Command | Result |
|---------|--------|
| `npm test` (`vitest run`) | **54 passed** (requires network for DID/status) |
| `npm run lint` | **passed** (0 errors) |
| `git diff --check` | **clean** |
| `git status --short` | See §8 |

---

## 1. What the SDK actually checks (`verify()` sequence)

Real checks in `lib/index.js` (production path when `_test` is empty):

1. **Input normalize** — `_normalizePdf417Input`: keep from first `@` only.
2. **Transport repair** — `_repairAamvaTransport`: known CRLF/header mangling only.
3. **AAMVA decode** — fail closed on throw (`PDF417 decode failed.`).
4. **Issuer IIN + DAJ** — California issuer identification + `DAJ=CA`.
5. **VCB required gate** — date / `requireVcb`.
6. **VCB decode** — base64 → CBOR-LD → credential.
7. **Optical hash** — AAMVA document hash for ecdsa-xi-2023.
8. **Cryptographic proof** — `vc.verifyCredential` + DataIntegrity / xi suite.
9. **Host allowlist** — `mode` (`prod` / `uat`) restricts DID and status URLs
   (`URL not allowed: …`).
10. **Status** (only if `verifyStatus: true`) — terse → bitstring URL,
    fetch status-list credential, verify list proof/issuers/purpose, then
    interpret revocation bit. Failures are `Status error` with preserved
    `error.cause` (revocation ≠ load failure).

**`_test` hooks:** honored only under Vitest / `NODE_ENV=test`
(`_allowTestOptions`). Fixture acceptance tests must not use `_test` to
bypass crypto. Mocks in the suite are labelled `[mock]` and are for
deterministic status-list unit cases only.

**Not implemented in this SDK:** physical-card authenticity, integer result
codes `1/0/2/10`, Xamarin/Android host.

---

## 2. Fixtures inventory

| Path | Present | Client claim | Notes |
|------|---------|--------------|-------|
| `Cali-1.raw` | Yes (577 B) | Real card | Untracked; gitignored; not modified |
| `Cali-Fake.raw` | Yes (549 B) | Physically fake card | Untracked; gitignored; not modified |
| `Client-Sample.raw` | **No** | Prior “invalid signature” paste | Cannot re-test; crypto-invalid path covered by public UAT invalid example + tamper tests |

---

## 3. Verification test matrix (evidence)

Legend for **Result**: PASS = measured outcome matches security expectation for
that cell; FAIL = unexpected; BLOCKED = external dependency; N/A = not
applicable. **Never inferred from filename alone.**

### 3.A Live client fixtures (no `_test` / no crypto mocks)

| Case | Input | Mode | verifyStatus | Crypto | Issuer | Allowlist | Status | Final | Result |
|------|-------|------|--------------|--------|--------|-----------|--------|-------|--------|
| Cali-1 real | file bytes | prod | true | OK | OK | OK | verified | `valid: true` | **PASS** |
| Cali-1 real | string | prod | true | OK | OK | OK | verified | `valid: true` | **PASS** |
| Cali-1 real | Buffer | prod | true | OK | OK | OK | verified | `valid: true` | **PASS** |
| Cali-1 real | ParserVer wrap | prod | true | OK | OK | OK | verified | `valid: true` | **PASS** |
| Cali-1 real | file bytes | uat | false | n/a | OK | **reject** | n/a | `Verify error` / `URL not allowed` | **PASS** |
| Cali-Fake physical-fake | file bytes | prod | true | OK | OK | OK | verified | `valid: true` | **PASS*** |
| Cali-Fake physical-fake | string | prod | true | OK | OK | OK | verified | `valid: true` | **PASS*** |
| Cali-Fake physical-fake | Buffer | prod | true | OK | OK | OK | verified | `valid: true` | **PASS*** |
| Cali-Fake physical-fake | ParserVer wrap | prod | true | OK | OK | OK | verified | `valid: true` | **PASS*** |
| Cali-Fake physical-fake | file bytes | uat | false | n/a | OK | **reject** | n/a | `URL not allowed` | **PASS** |
| Client-Sample | — | — | — | — | — | — | — | File absent | **NOT VERIFIED** |

\*PASS for **barcode cryptographic + status** acceptance. Does **not** PASS
as “SDK detected physical fake” — see §4. Measured: **not** `Invalid
signature.`, **not** revocation.

### 3.B Public UAT documentation examples (live DID; status optional)

| Case | Mode | Crypto | Allowlist | Final | Result |
|------|------|--------|-----------|-------|--------|
| validUatExample | uat | OK | OK | `valid: true` | **PASS** |
| validUatExample | prod | n/a | **reject** | `URL not allowed` (uat DID) | **PASS** |
| invalidUatExample | uat | **Invalid signature.** | OK issuer/VCB | `Verify error`; status not success | **PASS** |
| validUat + verifyStatus live | uat | OK proof | OK | Status fetch **404** → fail closed | **BLOCKED** (service) |

### 3.C Deterministic tampering (copy of public UAT valid; no fixture edits)

| Mutation | Rejection stage | Sanitized error | Result |
|----------|-----------------|-----------------|--------|
| Optical name field flip (`DAC…`) | Cryptographic proof | `Verify error` / `Invalid signature.` | **PASS** |
| Late ZCE/proof character flip | Cryptographic proof | `Verify error` / `Invalid signature.` | **PASS** |
| Early ZCE base64 corruption | VCB decode (before crypto) | `VC Barcode decode failed.` | **PASS** |
| `DAJCA` → `DAJXX` | Issuer validation (before crypto) | `Invalid DAJ field: "XX".` | **PASS** |
| Truncated header | Issuer / parse | `AAMVA CA issuer not found.` | **PASS** |

### 3.D Deterministic status unit tests (`[mock]` — labelled)

| Case | Outcome | Result |
|------|---------|--------|
| Revocation bit set | `Status error` / `Credential status indicates revocation.` | **PASS** |
| Status-list load failure | `Status error` / load cause (not revocation text) | **PASS** |
| Revocation vs load failure distinguishable via `error.cause` | Distinct messages | **PASS** |
| Status purpose / list signature / issuer mismatch | `Status error` + specific cause | **PASS** |

### 3.E Input robustness

| Case | Outcome | Result |
|------|---------|--------|
| null / empty string / empty bytes / empty Buffer | `valid: false`, no throw | **PASS** |
| Missing `@` (wrapper only) | Fail closed (issuer not found) | **PASS** |
| String / Uint8Array / Buffer parity (UAT + Cali-1) | Same validity | **PASS** |
| Scanner prefix before `@` | Same crypto outcome as bare payload | **PASS** |

---

## 4. Physical fake-card limitation (evidence-backed)

### Structural comparison (no PII) — both fixtures, live `verify()`

| Property | Cali-1 (real) | Cali-Fake (physical fake) |
|----------|---------------|---------------------------|
| Credential types | `VerifiableCredential`, `OpticalBarcodeCredential` | same |
| Issuer | `did:web:credentials.dmv.ca.gov` | same |
| Proof | `DataIntegrityProof` / `ecdsa-xi-2023` / `assertionMethod` | same |
| Verification method DID | `did:web:credentials.dmv.ca.gov` | same |
| Status type | `TerseBitstringStatusListEntry` | same |
| Status host | `api.credentials.dmv.ca.gov` | same |
| Status base path | `/status/dlid/1/status-lists` | same |
| **Live status-list URL path** | `/status/dlid/1/status-lists/revocation/39` | **same shard `/revocation/39`** |
| `verify()` with `verifyStatus: true` | `valid: true`, statusVerified | `valid: true`, statusVerified |

Repository search found **no** physical-card / counterfeit / secure-element /
hologram check API or DMV “card authenticity” service client in this codebase.

### Observation

`Cali-Fake.raw` yields **`valid: true`** for the same class of checks as
`Cali-1.raw`. Filename “Fake” does not change cryptographic outcome.

### Why this can happen

The SDK verifies the **digital signature binding optical AAMVA fields to a
VCB proof** (`ecdsa-xi-2023` + protected component hash) and (optionally)
**revocation status** via bitstring status lists. A counterfeit physical
card can still present a **cloned or reprinted barcode** whose proof still
verifies under the issuer’s keys and whose status bit is unset.

There is **no** credentialStatus purpose, proof field, or SDK return value
that means “physical card is counterfeit.”

### What a successful `verify()` establishes

For the selected `mode` and options (especially `verifyStatus: true`):

1. AAMVA PDF417 decoded; CA issuer IIN + DAJ accepted
2. VCB decoded to an OpticalBarcodeCredential
3. **Cryptographic** Data Integrity proof verifies (issuer key from DID)
4. Hosts match the mode allowlist
5. If status enabled: status-list credential loaded and verified; revocation
   bit for this entry is **not** set

### What it does **not** establish

- Physical card stock is genuine or non-counterfeit
- Visual / tactile security features were inspected
- The barcode was scanned from the originally issued plastic
- DMV separately attested the card body

### Physical-card authenticity detection

**UNSUPPORTED** by the current barcode SDK (**NOT VERIFIED** as a product
capability — evidence: absent from repo). External evidence needed: a DMV
card-to-barcode binding service, secure-element attestation, physical
inspection SOP, or a published status purpose dedicated to counterfeit
reporting (none consumed here beyond `revocation`).

**No silent change** to `valid` semantics.

---

## 5. Requirement rows (39 total)

### A. JavaScript SDK (24 rows)

| ID | Requirement | Status | Evidence |
|----|-------------|--------|----------|
| JS-01 | Parse CA PDF417 / AAMVA | **PASS** | decode path + tests |
| JS-01a | Strip before first `@` | **PASS** | normalize + wrapper tests |
| JS-01b | Invalid/missing data fail closed | **PASS** | null/empty tests |
| JS-01c | Buffer → Uint8Array, byte-preserving | **PASS** | Buffer DAJ + parity tests |
| JS-01d | AAMVA transport repair | **PASS** | CRLF repair + fixtures |
| JS-02 | CA issuer IIN + DAJ | **PASS** | bad issuer / bad DAJ / tamper DAJ |
| JS-03 | Decode VCB | **PASS** | vcbPresent assertions |
| JS-04 | ecdsa-xi-2023 + optical hash | **PASS** | valid UAT/prod; tamper optical → Invalid signature |
| JS-05 | UAT/prod allowlists | **PASS** | reject cross-mode |
| JS-06 | requireVcb / date gate | **PASS** | `[mock]` date tests |
| JS-07 | Terse status URL algorithm | **PASS** | code + UAT `/revocation/57` |
| JS-08 | Status-list credential signature | **PASS** | `[mock]` |
| JS-09 | Status issuer match | **PASS** | `[mock]` |
| JS-10 | Status purpose match | **PASS** | `[mock]` |
| JS-11 | Revocation bit → invalid | **PASS** | `[mock]` |
| JS-12 | Status unavailable fail closed | **PASS** | `[mock]` + live UAT 404 |
| JS-13 | Preserve status errors | **PASS** | load-failure tests |
| JS-14 | HTTP timeout | **PASS** | code review (`timeout: 15000`) |
| JS-15 | `_test` gated to test env | **PASS** | `_allowTestOptions` test |
| JS-16 | Malformed terse fields | **PASS** | `[mock]` |
| JS-17 | `{valid, error, debug}` shape | **PASS** | all tests |
| JS-18 | Revocation ≠ load failure | **PASS** | `[mock]` distinguishable |
| JS-19 | Live prod fixtures | **PASS** | Cali-1 + Cali-Fake matrix (§3.A) |
| JS-20 | Live UAT example + verifyStatus | **BLOCKED** | HTTP **404** on status list |

### B. Integer result codes (4 rows) — **NOT VERIFIED**

No authoritative definition of `1` / `0` / `2` / `10` exists in this
repository (`README` explicitly declines to define them). Do not invent
meanings. Client must supply the original contract.

### C. Xamarin / Android (11 rows)

| Status | Count |
|--------|------:|
| **FAIL** (deliverable absent) | 10 |
| **NOT VERIFIED** (toolchain; no project) | 1 |

No `.cs` / `.csproj` / `.sln` files in the repository. JS SDK acceptance
does **not** complete Xamarin/Android acceptance.

### Totals

| Status | Count |
|--------|------:|
| **PASS** | 23 |
| **FAIL** | 10 |
| **BLOCKED** | 1 |
| **NOT VERIFIED** | 5 |
| **Total** | **39** |

(24 JS + 4 RC + 11 XA = 39)

---

## 6. Live status verification (this run)

### Production fixtures (live, not mocked)

| Fixture | Status-list path requested | Live outcome |
|---------|----------------------------|--------------|
| Cali-1 | `api.credentials.dmv.ca.gov` + `/status/dlid/1/status-lists/revocation/39` | **Completed successfully** (`statusResult.verified: true`) |
| Cali-Fake | same host + **same** `/revocation/39` | **Completed successfully** (`statusResult.verified: true`) |

These paths are derived by the SDK as
`{terseStatusListBaseUrl}/revocation/{floor(terseStatusListIndex / 2^26)}`.
Personal fields are not logged.

### UAT documentation example (read-only, single probe)

| Check | Result |
|-------|--------|
| Path | `/status/dlid/1/status-lists/revocation/57` |
| Host | `api.uat-credentials.dmv.ca.gov` |
| HTTP | **404** |
| Classification | Infrastructure / publish gap — **not** signature failure, **not** confirmed revocation |

### Tamper / invalid-signature tests (labelling)

| Tag | Meaning |
|-----|---------|
| `[live-crypto]` | Real DID document load + real ecdsa-xi-2023 verify; no `_test` crypto bypass |
| `[live-integration]` / `[live-crypto+status]` | Live prod fixture; real crypto + live status list |
| `[deterministic unit]` | Controlled mutation rejected at decode/issuer before crypto |
| `[mock]` | Uses `_test` (e.g. in-memory status list); crypto of VCB may still run |

---

## 7. Release-readiness (not full client acceptance)

This section summarizes readiness for the **documented JavaScript SDK API
only**. It is **not** production release approval and **not** full multi-
deliverable client acceptance.

| Scope | Status | Notes |
|-------|--------|-------|
| **JS SDK** (`verify()` → `{valid, error, debug}`) | **Ready for documented API use** | Subject to correct `mode`, network access to allowed DID/status hosts, and `verifyStatus` behavior as documented. Evidence: 54 tests green; live prod fixtures; tamper `[live-crypto]` cases. |
| **UAT status-list** (`…/revocation/57`) | **BLOCKED** | HTTP **404**; fail-closed is correct. Not a revocation result. |
| **Integer codes `1` / `0` / `2` / `10`** | **Pending contract** | Not defined in this repository. |
| **Xamarin / Android** | **Out of scope here** | No implementation/toolchain in this repository until supplied. |
| **Physical-card authenticity** | **Not provided** | `Cali-Fake.raw` can still yield `valid: true`. Do **not** weaken crypto because of that. |

### Semantic consistency (README + this audit)

- **`valid: true`** means barcode decode, CA issuer/DAJ, VCB proof
  (ecdsa-xi-2023), mode allowlists, and optional status-list checks passed
  under the selected options.
- It does **not** mean the physical card is authentic.
- **`Cali-Fake.raw` passing** is a **documented limitation** of barcode-only
  verification, not a defect that justifies relaxing signature checks.

### Evidence required to close each open item

| Open item | Evidence needed | Who must supply it |
|-----------|-----------------|--------------------|
| UAT status 404 | Reachable Bitstring Status List credential at the documented UAT path (or an authoritative alternate UAT base URL / path in writing) so `verifyStatus: true` on the published UAT example can complete live | Party that operates / publishes `api.uat-credentials.dmv.ca.gov` status resources (or the documentation owner if the published URL is wrong) |
| Integer codes | Authoritative client contract defining meanings of `1` / `0` / `2` / `10` and mapping rules from `{valid, error.cause}` | Client / engagement contract owner |
| Xamarin/Android | Source project (or written confirmation that it is out of scope for this repo) plus build/toolchain requirements | Client / engagement deliverable owner |
| Physical-card authenticity | Specification of an authoritative signal (service, status purpose, or inspection process) **outside** barcode proof verification, if automation is required | Client together with the party that would publish or operate that signal |
| Crypto-invalid “fake” sample (optional) | A barcode fixture that fails proof verification under live `verify()` (current `Cali-Fake.raw` does not) | Client |

No owners, API meanings, or deadlines are invented beyond the need for the
artifact listed above.

---

## 8. Final verification (this engagement)

| Command | Result |
|---------|--------|
| `npm test` | **54 passed** |
| `npm run lint` | **passed** |
| `git diff --check` | **clean** |

Fixtures: `Cali-1.raw` / `Cali-Fake.raw` present locally, **gitignored**,
**not** tracked by Git, **not** modified this package step
(sha16 `856e1ab5f9c72b4e` / `89c84789f1399076`).

```
 M .gitignore
 M CHANGELOG.md
 M README.md
 M lib/index.js
 M package.json
 M tests/001-main.test.js
?? ACCEPTANCE_AUDIT.md
```

No commit, push, or deployment.
