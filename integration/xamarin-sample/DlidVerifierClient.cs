// Copyright 2024 - 2026 California Department of Motor Vehicles.
// Copyright 2018 - 2026 Digital Bazaar, Inc.
// SPDX-License-Identifier: BSD-3-Clause
//
// Option A sample: call the Node verifier HTTP service from Xamarin / .NET.
// This is integration guidance — drop into your VS 2022 Android project and
// adjust namespaces / HttpClient lifetime to match your app.
//
// Requires: System.Net.Http, System.Text.Json (or Newtonsoft.Json).

using System;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace Cadmv.DlidVerifier
{
    /// <summary>
    /// Integer codes returned by the verifier service (client contract).
    /// </summary>
    public static class DlidResultCodes
    {
        public const int Invalid = 0;
        public const int Valid = 1;
        public const int Revoked = 2;
        public const int Offline = 10;
    }

    /// <summary>
    /// HTTP client for the Node <c>integration/http-service.mjs</c> process.
    /// Keep the service reachable on-device (localhost / USB / private LAN).
    /// Full crypto runs in Node — not inside Jint.
    /// </summary>
    public sealed class DlidVerifierClient
    {
        private readonly HttpClient _http;
        private readonly Uri _verifyUri;

        public DlidVerifierClient(HttpClient http, string baseUrl)
        {
            _http = http ?? throw new ArgumentNullException(nameof(http));
            if (string.IsNullOrWhiteSpace(baseUrl))
            {
                throw new ArgumentException("Base URL required.", nameof(baseUrl));
            }
            _verifyUri = new Uri(new Uri(baseUrl.TrimEnd('/') + "/"), "v1/verify");
        }

        /// <summary>
        /// Verify a raw PDF417 barcode string from the scanner.
        /// </summary>
        /// <param name="rawBarcode">Scanner payload (may include ParserVer prefix).</param>
        /// <param name="online">Pass false when the device has no internet → code 10.</param>
        /// <param name="mode">"prod" or "uat".</param>
        /// <param name="cancellationToken">Cancellation.</param>
        /// <returns>Integer code 1, 0, 2, or 10.</returns>
        public async Task<int> VerifyAsync(
            string rawBarcode,
            bool online = true,
            string mode = "prod",
            CancellationToken cancellationToken = default)
        {
            if (!online)
            {
                return DlidResultCodes.Offline;
            }

            if (string.IsNullOrEmpty(rawBarcode))
            {
                return DlidResultCodes.Invalid;
            }

            var payload = new
            {
                data = rawBarcode,
                online = true,
                verifyStatus = true,
                requireGate = false,
                state = "CA",
                mode = mode ?? "prod"
            };

            using var content = new StringContent(
                JsonSerializer.Serialize(payload),
                Encoding.UTF8,
                "application/json");

            using var response = await _http
                .PostAsync(_verifyUri, content, cancellationToken)
                .ConfigureAwait(false);

            var json = await response.Content
                .ReadAsStringAsync()
                .ConfigureAwait(false);

            if (!response.IsSuccessStatusCode)
            {
                // Transport to the local Node service failed — treat as offline
                // only when the device cannot reach the service; otherwise invalid.
                return DlidResultCodes.Offline;
            }

            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.TryGetProperty("code", out var codeProp) &&
                codeProp.TryGetInt32(out var code))
            {
                return code;
            }

            return DlidResultCodes.Invalid;
        }
    }
}
