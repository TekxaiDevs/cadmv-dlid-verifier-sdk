// Copyright 2024 - 2026 California Department of Motor Vehicles.
// Copyright 2018 - 2026 Digital Bazaar, Inc.
// SPDX-License-Identifier: BSD-3-Clause

using System;
using System.Threading.Tasks;
using Android.App;
using Android.Runtime;
using Android.Webkit;

namespace Cadmv.DlidVerifier.Demo
{
    /// <summary>
    /// Starts the Chromium provider at process launch and keeps one warm
    /// <see cref="DlidVerifier"/> so Activity restarts skip the cold load.
    /// </summary>
    [Application]
    public sealed class DemoApplication : Application
    {
        private static DlidVerifier? s_verifier;
        private static Task? s_initTask;
        private static readonly object s_gate = new object();

        public DemoApplication(IntPtr handle, JniHandleOwnership transfer)
            : base(handle, transfer)
        {
        }

        public override void OnCreate()
        {
            base.OnCreate();

            // Force the WebView provider / GPU process to start before the UI
            // asks for the real verifier page (biggest emulator cold-start win).
            try
            {
                var warm = new WebView(this);
                warm.Destroy();
            }
            catch
            {
                // Provider missing — InitializeAsync will surface the failure.
            }

            // Kick verifier HTML/JS load in the background immediately.
            _ = GetOrCreateVerifierAsync();
        }

        public static Task<DlidVerifier> GetOrCreateVerifierAsync()
        {
            lock (s_gate)
            {
                if (s_verifier != null && s_initTask != null)
                {
                    return AwaitExisting(s_verifier, s_initTask);
                }

                var app = Application.Context
                    ?? throw new InvalidOperationException("No Application context.");
                var verifier = new DlidVerifier(app, VerifierStateConfig.California);
                var init = verifier.InitializeAsync();
                s_verifier = verifier;
                s_initTask = init;
                return AwaitExisting(verifier, init);
            }
        }

        private static async Task<DlidVerifier> AwaitExisting(
            DlidVerifier verifier,
            Task init)
        {
            await init.ConfigureAwait(false);
            return verifier;
        }
    }
}
