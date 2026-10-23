# Integration guide — iCA DL/ID Barcode Verifier

## Contract

| Direction | Format |
|-----------|--------|
| **Input (C# API)** | Raw scanner PDF417 `string` or `byte[]` |
| **C# → JS boundary** | Base64 of raw bytes (ISO-8859-1 for strings) |
| **Output** | `int`: **1** valid, **0** invalid, **2** revoked, **10** offline |
| **Timeout** | **10 seconds** per call (default). Timeout → **0** |
| **Threading** | WebView work on UI thread; `VerifyAsync` may be awaited from any thread. Calls are **queued** (one at a time). |
| **Offline** | `ConnectivityManager` before JS → **10** without loading crypto |
| **Product defaults** | `mode: "prod"`, `skipStatus: false` (two-pass: signature then revocation) |

Michael’s app already gates on issue date ≥ **2025-09-29** and/or signature
field present. Do not call `VerifyAsync` for older unsigned cards.

### What code `1` means

Barcode cryptographic proof verified against CA DMV keys for the selected
`mode`, and (when status is enabled) the credential is not revoked.

**Not** physical card authenticity. A cloned barcode with a still-valid
signature can return `1`. Surface that limit in UX if needed.

---

## Components to drop into the host app

From [`../android/Cadmv.DlidVerifier.Demo/`](../android/Cadmv.DlidVerifier.Demo/):

| File | Role |
|------|------|
| `DlidVerifier.cs` | Hidden WebView host |
| `VerifierJsBridge.cs` | `[JavascriptInterface]` callback |
| `VerifierStateConfig.cs` | Per-state asset / mode config |
| `DlidResultCodes.cs` | `0 / 1 / 2 / 10` constants |
| `Assets/verifier/verifier.html` | Host page |
| `Assets/verifier/ca-verifier.bundle.js` | Bundled SDK + wrapper |

NuGet: **Xamarin.AndroidX.WebKit** (for `WebViewAssetLoader`).

Permissions: `INTERNET`, `ACCESS_NETWORK_STATE`.

Load URL must be the AssetLoader HTTPS origin (secure context for
`crypto.subtle`):

`https://appassets.androidplatform.net/assets/verifier/verifier.html`

---

## Call pattern

```csharp
// Application start (Activity / Application)
_verifier = new DlidVerifier(this); // or Application context
await _verifier.InitializeAsync();

// After scan + his pre-gate
int code = await _verifier.VerifyAsync(rawBarcode, mode: "prod");
switch (code)
{
    case DlidResultCodes.Valid:   /* 1 */ break;
    case DlidResultCodes.Revoked: /* 2 */ break;
    case DlidResultCodes.Offline: /* 10 */ break;
    default:                      /* 0 */ break;
}
```

Demo / UAT crypto-only (when UAT status lists return 404):

```csharp
await _verifier.VerifyAsync(raw, mode: "uat", skipStatus: true); // expect 1 for valid UAT
```

Product path must **not** set `skipStatus: true`.

---

## Regenerate the JS bundle

Pin / update the SDK, then rebuild:

```sh
# From repo root — ensure @digitalbazaar/did-io is present
npm install

cd bridge/js
npm install
npm run build
# Copies dist/ca-verifier.bundle.js + verifier.html → Android Assets/verifier/
```

Record the git commit SHA of the SDK you tested when shipping to the client.
Locally the bridge depends on `cadmv-dlid-verifier-sdk` via `file:../..`.

Bundle entry: [`../js/src/verifyBarcode.js`](../js/src/verifyBarcode.js)  
Build script: [`../js/scripts/build.mjs`](../js/scripts/build.mjs)

---

## Two-pass behavior (JS)

1. **Pass 1** — `verify({ verifyStatus: false })`  
   - Network / DID fetch failure → **10**  
   - Bad signature, malformed, wrong issuer → **0**  
   - Valid → continue  
2. **Pass 2** — `verify({ verifyStatus: true })`  
   - Confirmed revocation → **2**  
   - Status list unreachable → **10**  
   - Valid → **1**  
   - Other → **0**

Any unexpected exception → **0** (fail closed).

---

## Adding the next state

1. Obtain that state’s JS SDK; wrap with the same Base64 + integer contract.
2. Bundle to e.g. `Assets/verifier-ny/`.
3. Add `VerifierStateConfig` instance (`StateId`, `AssetSubPath`, `DefaultMode`).
4. Construct `new DlidVerifier(context, nyConfig)`.

The WebView host, bridge, queue, timeout, and offline check stay unchanged.

---

## Dependencies

| Layer | Requirement |
|-------|-------------|
| Android | API 24+, Chromium WebView |
| AndroidX | `Xamarin.AndroidX.WebKit` |
| Network | HTTPS to `credentials.dmv.ca.gov` / `api.credentials.dmv.ca.gov` (prod) |
| Node (build only) | Node 20+, esbuild (bridge/js) |

---

## Related (non-product) paths

[`../../integration/`](../../integration/) hosts a **Node HTTP** smoke service
(“Option A”). The **product** integration for Michael’s Xamarin app is this
WebView bridge, not the HTTP service.
