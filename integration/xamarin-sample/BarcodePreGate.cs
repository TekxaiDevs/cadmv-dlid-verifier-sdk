// Copyright 2024 - 2026 California Department of Motor Vehicles.
// Copyright 2018 - 2026 Digital Bazaar, Inc.
// SPDX-License-Identifier: BSD-3-Clause
//
// Client pre-check: only invoke the verifier when issue date is on/after
// 2025-09-29 and/or a VCB (ZCE) field appears in the PDF417 payload.
// This does NOT prove the credential is valid — it only decides whether to call.

using System;
using System.Globalization;
using System.Text.RegularExpressions;

namespace Cadmv.DlidVerifier
{
    public static class BarcodePreGate
    {
        /// <summary>CA digital-signature required date (start of day local policy).</summary>
        public static readonly DateTime RequiredDate =
            new DateTime(2025, 9, 29, 0, 0, 0, DateTimeKind.Unspecified);

        /// <summary>
        /// Returns true when the host should call the online verifier.
        /// </summary>
        public static bool ShouldCallVerifier(string rawBarcode)
        {
            if (string.IsNullOrEmpty(rawBarcode))
            {
                return false;
            }

            var at = rawBarcode.IndexOf('@');
            var payload = at >= 0 ? rawBarcode.Substring(at) : rawBarcode;

            var hasVcb = payload.IndexOf("ZCE", StringComparison.Ordinal) >= 0;
            if (hasVcb)
            {
                return true;
            }

            // DBD is issue date MMDDCCYY in AAMVA DL/ID records.
            var match = Regex.Match(payload, @"DBD(\d{8})");
            if (!match.Success)
            {
                return false;
            }

            if (!DateTime.TryParseExact(
                    match.Groups[1].Value,
                    "MMddyyyy",
                    CultureInfo.InvariantCulture,
                    DateTimeStyles.None,
                    out var issued))
            {
                return false;
            }

            return issued.Date >= RequiredDate.Date;
        }
    }
}
