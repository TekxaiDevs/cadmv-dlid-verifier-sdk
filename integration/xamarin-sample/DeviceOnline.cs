// Copyright 2024 - 2026 California Department of Motor Vehicles.
// Copyright 2018 - 2026 Digital Bazaar, Inc.
// SPDX-License-Identifier: BSD-3-Clause

using System;

namespace Cadmv.DlidVerifier
{
    /// <summary>
    /// Host must inject platform connectivity. Android example uses
    /// ConnectivityManager; this abstraction keeps the sample portable.
    /// </summary>
    public interface IDeviceOnline
    {
        bool IsOnline();
    }

    /// <summary>
    /// Simple injectable flag for unit / emulator harnesses.
    /// </summary>
    public sealed class StaticDeviceOnline : IDeviceOnline
    {
        private readonly Func<bool> _probe;

        public StaticDeviceOnline(Func<bool> probe)
        {
            _probe = probe ?? throw new ArgumentNullException(nameof(probe));
        }

        public bool IsOnline() => _probe();
    }
}
