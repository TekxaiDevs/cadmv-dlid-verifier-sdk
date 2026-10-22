# End-to-end acceptance (Option A + remaining scope)

## 1. Xamarin / Android host (this repo)

| Step | Pass criteria |
|------|----------------|
| Build library | `dotnet build integration/xamarin-sample/Cadmv.DlidVerifier.csproj` |
| Start Node service | `npm run service` → `GET /health` returns `ok: true` |
| Emulator loopback | Android emulator uses `http://10.0.2.2:8787` |
| Offline | Airplane mode → code **10** without calling crypto |
| Pre-gate | No ZCE and issue date &lt; 2025-09-29 → orchestrator returns **0** (no HTTP) |
| Valid UAT crypto | Official UAT valid example → code **1** (`mode=uat`, status optional) |
| Invalid crypto | Official UAT invalid example → code **0** |
| Revoked (mock / when UAT live) | Confirmed revocation bit → code **2** |
| Scope | Response `scope.physicalAuthenticity === false` |

Automated (no device): `npm run test:e2e-host`

Device (client VS 2022): paste `Android/MainActivity.Sample.cs` into the app, point at the service, run the table above on emulator/device.

## 2. Live UAT revocation

| Check | Expected |
|-------|----------|
| `GET …/uat…/revocation/57` | **Currently HTTP 404** (DMV UAT lists not published) |
| SDK behavior | Fail-closed → `verifyStatus: true` → code **10** (not silent pass) |
| Unblock | CA DMV must publish UAT Bitstring Status Lists |
| Prod control | `GET …/prod…/revocation/39` → **200** (live revocation infra works) |

Probe anytime: `npm run test:e2e-host` (prints UAT/prod HTTP status).

## 3. Physical authenticity

| Fact | Implication |
|------|-------------|
| This SDK verifies **barcode crypto + allowlist + status** | Code **1** ≠ physical card is genuine |
| `Cali-Fake.raw` can still verify | Cloned/valid signature barcodes are in scope as **valid** |
| `VERIFIER_SCOPE.physicalAuthenticity` | Always **`false`** — hosts must not claim physical authenticity |
| Optical / forensic inspection | Out of scope — separate product capability |

**Do not** weaken cryptographic checks to “fail” a crypto-valid fake.
