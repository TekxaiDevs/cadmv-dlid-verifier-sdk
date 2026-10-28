# iCA DL/ID Barcode Verifier Bridge

WebView host for the California DMV JavaScript verifier inside a Xamarin /
.NET Android app. Returns integer codes **1 / 0 / 2 / 10** per the client
contract.

```
Scanner → C# DlidVerifier
            ├─ ConnectivityManager offline? → 10
            └─ Hidden WebView (WebViewAssetLoader)
                  └─ verifyBarcode(base64) two-pass
                        Pass 1: signature → Pass 2: revocation
                              └─ 1 | 0 | 2 | 10
```

## Layout

| Path | Purpose |
|------|---------|
| [`js/`](js/) | esbuild bundle + `verifyBarcode` wrapper |
| [`android/Cadmv.DlidVerifier.Demo/`](android/Cadmv.DlidVerifier.Demo/) | VS2022 demo app + `DlidVerifier` host |
| [`docs/INTEGRATION.md`](docs/INTEGRATION.md) | I/O contract, threading, update SDK |
| [`docs/TEST_MATRIX.md`](docs/TEST_MATRIX.md) | Acceptance cases and results |

## Quick start (JS bundle)

```sh
cd bridge/js
npm install
npm run build    # → dist/ + Android Assets/verifier/
npm test         # wrapper unit + live UAT crypto checks
```

## Quick start (Android demo)

See [`android/SETUP.md`](android/SETUP.md) for .NET / JDK / emulator install.

```sh
source bridge/android/env.sh          # .NET 9 + JDK 17 + Android SDK
./bridge/android/run-emulator-demo.sh # start AVD if needed, install, launch
```

Or open [`android/Cadmv.DlidVerifier.Demo.sln`](android/Cadmv.DlidVerifier.Demo.sln) in VS2022.

In the app:

1. Tap **UAT Valid** (auto: UAT mode ON, Skip status ON) → **Verify** → expect **1**.
2. Tap **Prod Real** (auto: UAT OFF, Skip status OFF) → **Verify** → expect **1**.
3. **Prod Clone** (formerly “Prod Fake”) is a physical clone whose barcode
   crypto still verifies → expect **1** (not a physical authenticity fail).
4. Airplane mode → expect **10**.

**UAT vs Prod:** UAT buttons load CA DMV *sandbox* documentation samples
(`uat-credentials.dmv.ca.gov`). Prod buttons load *production* barcodes
(`credentials.dmv.ca.gov`). Mode must match the sample or verification fails.

## Product call site (Michael’s app)

```csharp
// At startup:
_verifier = new DlidVerifier(this);
await _verifier.InitializeAsync();

// After his pre-gate (issue date ≥ 2025-09-29 and/or ZCE present):
int code = await _verifier.VerifyAsync(rawBarcodeFromScanner, mode: "prod");
// 1 valid | 0 invalid | 2 revoked | 10 offline
```

Default product path: `mode: "prod"`, `skipStatus: false` (two-pass).

See [docs/INTEGRATION.md](docs/INTEGRATION.md) for full contract and how to
add the next state.
