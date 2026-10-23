// Copyright 2024 - 2026 California Department of Motor Vehicles.
// Copyright 2018 - 2026 Digital Bazaar, Inc.
// SPDX-License-Identifier: BSD-3-Clause

using System;
using System.Collections.Concurrent;
using System.Threading.Tasks;
using Android.Webkit;
using Java.Interop;

namespace Cadmv.DlidVerifier
{
    /// <summary>
    /// JS → C# bridge. The page calls
    /// <c>CaVerifierBridge.onReady()</c> when the bundle is loaded and
    /// <c>CaVerifierBridge.onResult(requestId, code)</c> when verification finishes.
    /// </summary>
    public sealed class VerifierJsBridge : Java.Lang.Object
    {
        private readonly ConcurrentDictionary<string, TaskCompletionSource<int>> _pending =
            new ConcurrentDictionary<string, TaskCompletionSource<int>>();

        private TaskCompletionSource<bool>? _readyTcs;

        public void AttachReady(TaskCompletionSource<bool> readyTcs)
        {
            _readyTcs = readyTcs;
        }

        public TaskCompletionSource<int> Register(string requestId)
        {
            var tcs = new TaskCompletionSource<int>(
                TaskCreationOptions.RunContinuationsAsynchronously);
            if (!_pending.TryAdd(requestId, tcs))
            {
                throw new InvalidOperationException(
                    $"Duplicate verifier request id: {requestId}");
            }
            return tcs;
        }

        public void Cancel(string requestId, int code = DlidResultCodes.Invalid)
        {
            if (_pending.TryRemove(requestId, out var tcs))
            {
                tcs.TrySetResult(code);
            }
        }

        [Export("onReady")]
        [JavascriptInterface]
        public void OnReady()
        {
            _readyTcs?.TrySetResult(true);
        }

        [Export("onResult")]
        [JavascriptInterface]
        public void OnResult(string requestId, string code)
        {
            if (!_pending.TryRemove(requestId, out var tcs))
            {
                return;
            }
            if (!int.TryParse(code, out var parsed))
            {
                tcs.TrySetResult(DlidResultCodes.Invalid);
                return;
            }
            tcs.TrySetResult(parsed);
        }
    }
}
