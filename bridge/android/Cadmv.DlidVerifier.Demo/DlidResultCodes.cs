// Copyright 2024 - 2026 California Department of Motor Vehicles.
// Copyright 2018 - 2026 Digital Bazaar, Inc.
// SPDX-License-Identifier: BSD-3-Clause

namespace Cadmv.DlidVerifier
{
    /// <summary>
    /// Integer codes returned to the host app (client contract, Oct 21).
    /// </summary>
    public static class DlidResultCodes
    {
        public const int Invalid = 0;
        public const int Valid = 1;
        public const int Revoked = 2;
        public const int Offline = 10;
    }
}
