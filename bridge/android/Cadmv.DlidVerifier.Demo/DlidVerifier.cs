// Copyright 2024 - 2026 California Department of Motor Vehicles.
// Copyright 2018 - 2026 Digital Bazaar, Inc.
// SPDX-License-Identifier: BSD-3-Clause
//
// Hidden WebView host for the CA DMV JS verifier.
// Drop into a Xamarin.Android / .NET Android app; call InitializeAsync at startup.

using System;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Android.Content;
using Android.Net;
using Android.OS;
using Android.Webkit;
using AndroidX.WebKit;

namespace Cadmv.DlidVerifier
{
    /// <summary>
    /// Owns one hidden WebView, initializes it once, and exposes
    /// <see cref="VerifyAsync"/> returning 1 / 0 / 2 / 10.
    /// </summary>
    /// <remarks>
    /// Code 1 means barcode crypto + unrevoked status for the selected mode.
    /// It does <b>not</b> assert physical card authenticity.
    /// </remarks>
    public sealed class DlidVerifier : IDisposable
    {
        public const int DefaultTimeoutMs = 10_000;
        public const int DefaultInitTimeoutMs = 30_000;

        private readonly Context _context;
        private readonly VerifierStateConfig _config;
        private readonly object _gate = new object();

        private WebView? _webView;
        private VerifierJsBridge? _bridge;
        private TaskCompletionSource<bool>? _readyTcs;
        private Task? _queueTail;
        private bool _disposed;

        public DlidVerifier(Context context, VerifierStateConfig? config = null)
        {
            // Prefer Activity context for WebView creation; ApplicationContext can
            // leave the hidden WebView unable to finish loading on some devices.
            _context = context ?? throw new ArgumentNullException(nameof(context));
            _config = config ?? VerifierStateConfig.California;
            _queueTail = Task.CompletedTask;
        }

        /// <summary>
        /// Warm the WebView and load verifier.html (call once at app start).
        /// </summary>
        public async Task InitializeAsync(CancellationToken cancellationToken = default)
        {
            ThrowIfDisposed();
            var tcs = new TaskCompletionSource<bool>(
                TaskCreationOptions.RunContinuationsAsynchronously);

            RunOnUiThread(() =>
            {
                try
                {
                    EnsureWebViewLocked(tcs);
                }
                catch (Exception ex)
                {
                    tcs.TrySetException(ex);
                }
            });

            using var timeoutCts = new CancellationTokenSource(
                TimeSpan.FromMilliseconds(DefaultInitTimeoutMs));
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(
                cancellationToken, timeoutCts.Token);
            try
            {
                // WaitAsync is .NET 6+; use WhenAny so classic Xamarin.Android builds.
                await WaitWithCancellationAsync(tcs.Task, linked.Token).ConfigureAwait(false);
            }
            catch (System.OperationCanceledException) when (timeoutCts.IsCancellationRequested
                && !cancellationToken.IsCancellationRequested)
            {
                throw new TimeoutException(
                    "Verifier WebView init timed out (bundle failed to signal ready).");
            }
        }

        /// <summary>
        /// Verify a raw scanner PDF417 string. Encodes to Base64 for the JS boundary.
        /// Uses ISO-8859-1 so char codes 0–255 map 1:1 to bytes (scanner control chars).
        /// </summary>
        /// <param name="rawBarcode">Scanner payload (control characters preserved).</param>
        /// <param name="mode">Override mode; null uses <see cref="VerifierStateConfig.DefaultMode"/>.</param>
        /// <param name="skipStatus">Demo only: skip pass-2 revocation. Product: false.</param>
        /// <param name="timeoutMs">Per-call timeout (default 10 s) → 0 on expiry.</param>
        /// <param name="cancellationToken">Cancellation.</param>
        public Task<int> VerifyAsync(
            string rawBarcode,
            string? mode = null,
            bool skipStatus = false,
            int timeoutMs = DefaultTimeoutMs,
            CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrEmpty(rawBarcode))
            {
                return Task.FromResult(DlidResultCodes.Invalid);
            }

            // Latin-1: one char → one byte, preserves RS/CR/LF and high bytes from scanners.
            var bytes = Encoding.GetEncoding("ISO-8859-1").GetBytes(rawBarcode);
            return VerifyAsync(bytes, mode, skipStatus, timeoutMs, cancellationToken);
        }

        /// <summary>
        /// Verify raw PDF417 bytes (preferred when the scanner API returns a byte array).
        /// </summary>
        public Task<int> VerifyAsync(
            byte[] rawBytes,
            string? mode = null,
            bool skipStatus = false,
            int timeoutMs = DefaultTimeoutMs,
            CancellationToken cancellationToken = default)
        {
            ThrowIfDisposed();

            if (rawBytes == null || rawBytes.Length == 0)
            {
                return Task.FromResult(DlidResultCodes.Invalid);
            }

            if (!IsDeviceOnline())
            {
                return Task.FromResult(DlidResultCodes.Offline);
            }

            var work = new Func<Task<int>>(() => VerifyCoreAsync(
                rawBytes, mode, skipStatus, timeoutMs, cancellationToken));

            lock (_gate)
            {
                var next = _queueTail!.ContinueWith(
                    async _ => await work().ConfigureAwait(false),
                    CancellationToken.None,
                    TaskContinuationOptions.None,
                    TaskScheduler.Default).Unwrap();
                _queueTail = next.ContinueWith(_ => { }, TaskScheduler.Default);
                return next;
            }
        }

        public void Dispose()
        {
            if (_disposed)
            {
                return;
            }
            _disposed = true;
            RunOnUiThread(() =>
            {
                if (_webView != null)
                {
                    _webView.StopLoading();
                    _webView.Destroy();
                    _webView = null;
                }
                _bridge = null;
            });
        }

        private async Task<int> VerifyCoreAsync(
            byte[] rawBytes,
            string? mode,
            bool skipStatus,
            int timeoutMs,
            CancellationToken cancellationToken)
        {
            await InitializeAsync(cancellationToken).ConfigureAwait(false);

            var requestId = Guid.NewGuid().ToString("N");
            var base64 = Convert.ToBase64String(rawBytes);
            var effectiveMode = string.IsNullOrWhiteSpace(mode)
                ? _config.DefaultMode
                : mode!;
            var skipJs = skipStatus ? "true" : "false";

            // Base64 alphabet is JS-string-safe; still escape mode.
            var js = $"__caVerify('{requestId}','{base64}','{EscapeJs(effectiveMode)}',{skipJs});";

            var bridge = _bridge
                ?? throw new InvalidOperationException("Verifier bridge not ready.");
            var resultTcs = bridge.Register(requestId);

            RunOnUiThread(() =>
            {
                try
                {
                    _webView?.EvaluateJavascript(js, null);
                }
                catch
                {
                    bridge.Cancel(requestId, DlidResultCodes.Invalid);
                }
            });

            using var timeoutCts = new CancellationTokenSource(
                TimeSpan.FromMilliseconds(Math.Max(1, timeoutMs)));
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(
                cancellationToken, timeoutCts.Token);

            try
            {
                // WaitAsync is .NET 6+; use WhenAny so classic Xamarin.Android builds.
                return await WaitWithCancellationAsync(resultTcs.Task, linked.Token)
                    .ConfigureAwait(false);
            }
            catch (System.OperationCanceledException)
            {
                bridge.Cancel(requestId, DlidResultCodes.Invalid);
                // Timeout / cancel → fail closed as invalid (0), not offline.
                return DlidResultCodes.Invalid;
            }
        }

        /// <summary>
        /// Await a task until it completes or <paramref name="cancellationToken"/> fires.
        /// Compatible with classic Xamarin.Android (no <c>Task.WaitAsync</c>).
        /// </summary>
        private static async Task<T> WaitWithCancellationAsync<T>(
            Task<T> task,
            CancellationToken cancellationToken)
        {
            if (task == null)
            {
                throw new ArgumentNullException(nameof(task));
            }

            if (task.IsCompleted)
            {
                return await task.ConfigureAwait(false);
            }

            cancellationToken.ThrowIfCancellationRequested();

            var cancelTcs = new TaskCompletionSource<bool>(
                TaskCreationOptions.RunContinuationsAsynchronously);
            using (cancellationToken.Register(
                s => ((TaskCompletionSource<bool>)s).TrySetResult(true),
                cancelTcs))
            {
                var completed = await Task.WhenAny(task, cancelTcs.Task)
                    .ConfigureAwait(false);
                if (completed != task)
                {
                    // Observe faults on the abandoned task so they are not unobserved.
                    _ = task.ContinueWith(
                        t => { var _unused = t.Exception; },
                        CancellationToken.None,
                        TaskContinuationOptions.OnlyOnFaulted
                            | TaskContinuationOptions.ExecuteSynchronously,
                        TaskScheduler.Default);
                    cancellationToken.ThrowIfCancellationRequested();
                    throw new System.OperationCanceledException(cancellationToken);
                }
            }

            return await task.ConfigureAwait(false);
        }

        private void EnsureWebViewLocked(TaskCompletionSource<bool> readyTcs)
        {
            if (_webView != null)
            {
                if (_readyTcs?.Task.IsCompletedSuccessfully == true)
                {
                    readyTcs.TrySetResult(true);
                    return;
                }

                // Another caller is already loading — piggy-back on the same ready task.
                if (_readyTcs != null)
                {
                    _readyTcs.Task.ContinueWith(
                        t =>
                        {
                            if (t.IsCompletedSuccessfully)
                            {
                                readyTcs.TrySetResult(true);
                            }
                            else if (t.IsFaulted && t.Exception != null)
                            {
                                readyTcs.TrySetException(
                                    t.Exception.GetBaseException());
                            }
                            else
                            {
                                readyTcs.TrySetCanceled();
                            }
                        },
                        TaskScheduler.Default);
                    return;
                }
            }

            _readyTcs = readyTcs;
            _bridge = new VerifierJsBridge();
            _bridge.AttachReady(readyTcs);

            // ApplicationContext is fine once Chromium is warm; prefer it so the
            // WebView outlives the Activity when the host keeps a process singleton.
            var webContext = _context.ApplicationContext ?? _context;
            var webView = new WebView(webContext);
            // Must be set before any WebView is created in the process.
            WebView.SetWebContentsDebuggingEnabled(true);

            webView.Settings.JavaScriptEnabled = true;
            webView.Settings.DomStorageEnabled = true;
            // Avoid stale ca-verifier.bundle.js after asset updates.
            webView.Settings.CacheMode = CacheModes.NoCache;
            webView.Settings.AllowFileAccess = false;
            webView.Settings.AllowContentAccess = false;
            // Hidden — not added to a layout.
            webView.LayoutParameters = new Android.Views.ViewGroup.LayoutParams(1, 1);

            var assetLoader = new WebViewAssetLoader.Builder()
                .AddPathHandler(
                    "/assets/",
                    new WebViewAssetLoader.AssetsPathHandler(webContext))
                .Build();

            webView.SetWebViewClient(new VerifierWebViewClient(assetLoader, readyTcs));
            webView.SetWebChromeClient(new VerifierWebChromeClient());
            webView.AddJavascriptInterface(_bridge, "CaVerifierBridge");
            webView.ClearCache(true);
            webView.LoadUrl(_config.HostPageUrl);
            _webView = webView;
        }

        private bool IsDeviceOnline()
        {
            var cm = (ConnectivityManager?)_context.GetSystemService(
                Context.ConnectivityService);
            if (cm == null)
            {
                return false;
            }

            if (Build.VERSION.SdkInt >= BuildVersionCodes.M)
            {
                var network = cm.ActiveNetwork;
                if (network == null)
                {
                    return false;
                }
                var caps = cm.GetNetworkCapabilities(network);
                if (caps == null)
                {
                    return false;
                }
                return caps.HasTransport(TransportType.Wifi)
                    || caps.HasTransport(TransportType.Cellular)
                    || caps.HasTransport(TransportType.Ethernet);
            }

#pragma warning disable CS0618
            var info = cm.ActiveNetworkInfo;
            return info != null && info.IsConnected;
#pragma warning restore CS0618
        }

        private void RunOnUiThread(Action action)
        {
            var looper = Looper.MainLooper;
            if (looper != null && Looper.MyLooper() == looper)
            {
                action();
                return;
            }
            new Handler(looper!).Post(action);
        }

        private void ThrowIfDisposed()
        {
            if (_disposed)
            {
                throw new ObjectDisposedException(nameof(DlidVerifier));
            }
        }

        private static string EscapeJs(string value) =>
            value.Replace("\\", "\\\\").Replace("'", "\\'");

        private sealed class VerifierWebChromeClient : WebChromeClient
        {
            public override bool OnConsoleMessage(ConsoleMessage? consoleMessage)
            {
                if (consoleMessage != null)
                {
                    Android.Util.Log.WriteLine(
                        Android.Util.LogPriority.Warn,
                        "CaVerifierJS",
                        $"{consoleMessage.InvokeMessageLevel()}: {consoleMessage.Message()} " +
                        $"({consoleMessage.SourceId()}:{consoleMessage.LineNumber()})");
                }
                return base.OnConsoleMessage(consoleMessage);
            }
        }

        private sealed class VerifierWebViewClient : WebViewClient
        {
            private readonly WebViewAssetLoader _assetLoader;
            private readonly TaskCompletionSource<bool> _ready;

            public VerifierWebViewClient(
                WebViewAssetLoader assetLoader,
                TaskCompletionSource<bool> ready)
            {
                _assetLoader = assetLoader;
                _ready = ready;
            }

            public override WebResourceResponse? ShouldInterceptRequest(
                WebView? view,
                IWebResourceRequest? request)
            {
                if (request?.Url != null)
                {
                    var intercepted = _assetLoader.ShouldInterceptRequest(request.Url);
                    if (intercepted == null && request.Url?.Host != null &&
                        !request.Url.Host.Contains("androidplatform"))
                    {
                        Android.Util.Log.WriteLine(
                            Android.Util.LogPriority.Info,
                            "CaVerifierNet",
                            $"pass-through {request.Method} {request.Url}");
                    }
                    return intercepted;
                }
                return base.ShouldInterceptRequest(view, request);
            }

            public override void OnPageFinished(WebView? view, string? url)
            {
                base.OnPageFinished(view, url);
                // Prefer CaVerifierBridge.onReady() from the minified footer.
                // Fallback if the bridge call was missed (older assets).
                view?.PostDelayed(
                    () =>
                    {
                        if (!_ready.Task.IsCompleted)
                        {
                            view.EvaluateJavascript(
                                "!!(globalThis.CaVerifier&&CaVerifier.verifyBarcode)",
                                new ReadyJsCallback(_ready));
                        }
                    },
                    30);
            }

            public override void OnReceivedError(
                WebView? view,
                IWebResourceRequest? request,
                WebResourceError? error)
            {
                base.OnReceivedError(view, request, error);
                if (request?.IsForMainFrame == true)
                {
                    _ready.TrySetException(new InvalidOperationException(
                        $"Verifier page failed to load: {error?.Description}"));
                }
            }
        }

        private sealed class ReadyJsCallback : Java.Lang.Object, IValueCallback
        {
            private readonly TaskCompletionSource<bool> _ready;

            public ReadyJsCallback(TaskCompletionSource<bool> ready)
            {
                _ready = ready;
            }

            public void OnReceiveValue(Java.Lang.Object? value)
            {
                var text = value?.ToString() ?? "false";
                if (text.Contains("true", StringComparison.OrdinalIgnoreCase))
                {
                    _ready.TrySetResult(true);
                }
                else
                {
                    _ready.TrySetException(new InvalidOperationException(
                        "CaVerifier API missing after page load."));
                }
            }
        }
    }
}
