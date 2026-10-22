// Copyright 2024 - 2026 California Department of Motor Vehicles.
// Copyright 2018 - 2026 Digital Bazaar, Inc.
// SPDX-License-Identifier: BSD-3-Clause
//
// End-to-end host flow matching client acceptance:
// connectivity → pre-gate → Node verifier → integer code.

using System;
using System.Threading;
using System.Threading.Tasks;

namespace Cadmv.DlidVerifier
{
    /// <summary>
    /// Orchestrates the Option A Xamarin acceptance path.
    /// </summary>
    public sealed class VerifyOrchestrator
    {
        private readonly IDeviceOnline _online;
        private readonly DlidVerifierClient _client;

        public VerifyOrchestrator(IDeviceOnline online, DlidVerifierClient client)
        {
            _online = online ?? throw new ArgumentNullException(nameof(online));
            _client = client ?? throw new ArgumentNullException(nameof(client));
        }

        /// <summary>
        /// Full acceptance path. Returns 1 / 0 / 2 / 10.
        /// </summary>
        /// <remarks>
        /// Physical-card authenticity is NOT determined here. A crypto-valid
        /// barcode (including a cloned fake) can still return Valid (1).
        /// </remarks>
        public async Task<int> VerifyScannedBarcodeAsync(
            string rawBarcode,
            string mode = "prod",
            bool skipPreGate = false,
            CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrEmpty(rawBarcode))
            {
                return DlidResultCodes.Invalid;
            }

            if (!_online.IsOnline())
            {
                return DlidResultCodes.Offline;
            }

            if (!skipPreGate && !BarcodePreGate.ShouldCallVerifier(rawBarcode))
            {
                // Client policy: do not call crypto verifier for pre-signature
                // cards without VCB. Treat as invalid for this acceptance path.
                return DlidResultCodes.Invalid;
            }

            return await _client
                .VerifyAsync(rawBarcode, online: true, mode, cancellationToken)
                .ConfigureAwait(false);
        }
    }
}
