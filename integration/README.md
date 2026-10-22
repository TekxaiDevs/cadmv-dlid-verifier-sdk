# Xamarin / .NET integration (Option A)

The CA DMV DLID verifier SDK is a **Node.js** library with cryptographic and
HTTP dependencies. It is **not** intended to run inside Jint.

## Architecture

```
Scanner → Xamarin Android (C#)
            │
            ├─ Connectivity check → if offline and would verify → return 10
            ├─ BarcodePreGate (issue date ≥ 2025-09-29 and/or ZCE present)
            │     └─ if gate fails → skip verifier (app policy) or return 0
            └─ HTTP POST → Node service (this repo)
                              └─ verifyWithCode / verify (crypto + status)
                                    └─ code 1 | 0 | 2 | 10
```

## Result codes

| Code | Meaning |
|-----:|---------|
| `1` | Valid (proof + allowlist + status when enabled) |
| `0` | Invalid / malformed / crypto failure / allowlist |
| `2` | Confirmed revoked (`verifyStatus: true`) |
| `10` | Internet not available (host offline or network failure reaching DID/status) |

## Run the Node service

From the repository root (Node 20+):

```sh
npm install
node integration/http-service.mjs
# http://127.0.0.1:8787
```

Health check: `GET /health`  
Verify: `POST /v1/verify` with JSON `{ "data": "<raw barcode>", "mode": "prod" }`

Environment:

- `VERIFY_HOST` (default `127.0.0.1`)
- `VERIFY_PORT` (default `8787`)

## C# samples

See [`xamarin-sample/`](./xamarin-sample/):

- `BarcodePreGate.cs` — issue-date / ZCE gate
- `DlidVerifierClient.cs` — HTTP client returning `1|0|2|10`

Wire these into your existing Visual Studio 2022 Xamarin Android app. This
repository does not contain your full application; drop-in classes are provided
so you can call the service without embedding Jint.

## Multi-state

`verifyWithCode({ state: 'CA' })` is implemented. Other `state` values return
code `0` until additional jurisdiction plugins are supplied.

## Acceptance checklist

See [`ACCEPTANCE.md`](./ACCEPTANCE.md) for Xamarin e2e, live UAT revocation,
and physical-authenticity scope.

```sh
npm run test:e2e-host
dotnet build integration/xamarin-sample/Cadmv.DlidVerifier.csproj
```

## What this does not do

- Physical-card authenticity detection (`scope.physicalAuthenticity: false`)
- Running the full SDK inside Jint / WebView (unsupported for this dependency set)
- Publishing UAT status lists (external DMV service dependency — still HTTP 404)
