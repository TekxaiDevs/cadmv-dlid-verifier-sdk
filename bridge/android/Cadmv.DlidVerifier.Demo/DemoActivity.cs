// Copyright 2024 - 2026 California Department of Motor Vehicles.
// Copyright 2018 - 2026 Digital Bazaar, Inc.
// SPDX-License-Identifier: BSD-3-Clause

using System;
using System.IO;
using System.Text;
using Android.App;
using Android.OS;
using Android.Text;
using Android.Views;
using Android.Widget;
using Cadmv.DlidVerifier;
using SoftInput = Android.Views.SoftInput;

namespace Cadmv.DlidVerifier.Demo
{
    [Activity(
        Label = "CA DL/ID Verifier Demo",
        MainLauncher = true,
        Theme = "@android:style/Theme.Material.Light",
        WindowSoftInputMode = SoftInput.AdjustResize)]
    public class DemoActivity : Activity
    {
        private static readonly Encoding Latin1 = Encoding.GetEncoding("ISO-8859-1");

        private DlidVerifier? _verifier;
        private bool _ready;
        // EditText strips AAMVA RS (0x1E); keep asset bytes and verify those.
        private byte[]? _rawBarcodeBytes;
        private bool _suppressTextChanged;

        protected override async void OnCreate(Bundle? savedInstanceState)
        {
            base.OnCreate(savedInstanceState);

            var status = new TextView(this)
            {
                Text = "Status: initializing WebView…",
                TextSize = 16f
            };

            var input = new EditText(this)
            {
                Hint = "Paste raw PDF417 (or tap a Load button)",
                Gravity = GravityFlags.Top
            };
            input.SetMinLines(3);
            input.SetMaxLines(4);
            input.VerticalScrollBarEnabled = true;
            input.TextChanged += OnInputTextChanged;

            var loadValid = new Button(this) { Text = "UAT Valid" };
            var loadInvalid = new Button(this) { Text = "UAT Invalid" };
            var loadReal = new Button(this) { Text = "Prod Real" };
            // Physically fake card; barcode crypto is still valid → expect 1.
            var loadFake = new Button(this) { Text = "Prod Clone" };
            var clear = new Button(this) { Text = "Clear" };

            var uatSwitch = new Switch(this)
            {
                Text = "UAT mode (sandbox hosts)",
                Checked = true
            };
            var skipStatus = new Switch(this)
            {
                Text = "Skip status (pass-1 only, demo)",
                Checked = true
            };

            var verify = new Button(this)
            {
                Text = "Verify",
                Enabled = false
            };
            var result = new TextView(this)
            {
                Text =
                    "Result: —\n" +
                    "1=valid  0=invalid  2=revoked  10=offline\n" +
                    "UAT buttons = CA DMV sandbox samples (need UAT mode).\n" +
                    "Prod buttons = production barcodes (need UAT mode OFF).\n" +
                    "Prod Clone still returns 1 — barcode crypto OK, not physical check.",
                TextSize = 16f
            };

            var row1 = new LinearLayout(this) { Orientation = Orientation.Horizontal };
            row1.AddView(loadValid);
            row1.AddView(loadInvalid);
            row1.AddView(clear);

            var row2 = new LinearLayout(this) { Orientation = Orientation.Horizontal };
            row2.AddView(loadReal);
            row2.AddView(loadFake);

            var layout = new LinearLayout(this) { Orientation = Orientation.Vertical };
            layout.SetPadding(24, 24, 24, 24);
            // Status + result near the top so the keyboard cannot hide them.
            layout.AddView(status);
            layout.AddView(result);
            layout.AddView(verify);
            layout.AddView(uatSwitch);
            layout.AddView(skipStatus);
            layout.AddView(row1);
            layout.AddView(row2);
            layout.AddView(input);

            var scroll = new ScrollView(this);
            scroll.AddView(layout);
            SetContentView(scroll);

            // Wire clicks before awaiting init — otherwise buttons look live but do nothing.
            // forceProd: prod issuer hosts. forceUat: UAT sandbox hosts.
            // Matching mode is required — cross-mode always fails ("URL not allowed").
            void LoadFixture(
                string asset,
                bool forceProd,
                bool forceUat,
                bool skipStatusForFixture,
                string? hint = null)
            {
                try
                {
                    var bytes = ReadAssetBytes(asset);
                    _suppressTextChanged = true;
                    input.Text = Latin1.GetString(bytes);
                    _rawBarcodeBytes = bytes;
                    _suppressTextChanged = false;

                    if (forceProd)
                    {
                        uatSwitch.Checked = false;
                    }
                    else if (forceUat)
                    {
                        uatSwitch.Checked = true;
                    }
                    // UAT status lists often 404 → keep skip ON for UAT demos.
                    // Prod path uses live status lists → turn skip OFF.
                    skipStatus.Checked = skipStatusForFixture;

                    DismissKeyboard(input);
                    var hasRs = Array.IndexOf(bytes, (byte)0x1e) >= 0;
                    var modeLabel = uatSwitch.Checked ? "UAT" : "prod";
                    status.Text = (hint ?? $"Loaded {asset}") +
                        $" ({bytes.Length} B, RS={(hasRs ? "yes" : "no")}, " +
                        $"mode={modeLabel}, skipStatus={skipStatus.Checked})";
                }
                catch (Exception ex)
                {
                    _suppressTextChanged = false;
                    _rawBarcodeBytes = null;
                    status.Text = $"Load failed: {ex.Message}";
                    Toast.MakeText(this, status.Text, ToastLength.Long)!.Show();
                }
            }

            // Official CA DMV UAT documentation samples (sandbox DID hosts).
            loadValid.Click += (_, __) => LoadFixture(
                "fixtures/uat-valid.txt",
                forceProd: false,
                forceUat: true,
                skipStatusForFixture: true,
                hint: "UAT valid (sandbox sample) — expect 1. UAT mode ON, skip status ON " +
                    "(UAT revocation lists often 404 → would return 10).");
            loadInvalid.Click += (_, __) => LoadFixture(
                "fixtures/uat-invalid.txt",
                forceProd: false,
                forceUat: true,
                skipStatusForFixture: true,
                hint: "UAT invalid signature — expect 0. UAT mode ON.");
            // Client captures: files/Cali-1.raw and files/Cali-Fake.raw (prod issuer).
            loadReal.Click += (_, __) => LoadFixture(
                "fixtures/cali-1-real.txt",
                forceProd: true,
                forceUat: false,
                skipStatusForFixture: false,
                hint: "Cali-1.raw (production real) — expect 1. UAT OFF, status ON.");
            loadFake.Click += (_, __) => LoadFixture(
                "fixtures/cali-fake.txt",
                forceProd: true,
                forceUat: false,
                skipStatusForFixture: false,
                hint: "Cali-Fake.raw (physical clone; barcode crypto still valid) — expect 1. " +
                    "Not a physical authenticity check.");
            clear.Click += (_, __) =>
            {
                _rawBarcodeBytes = null;
                _suppressTextChanged = true;
                input.Text = string.Empty;
                _suppressTextChanged = false;
                DismissKeyboard(input);
            };

            verify.Click += async (_, __) =>
            {
                if (_verifier == null || !_ready)
                {
                    Toast.MakeText(this, "WebView not ready yet", ToastLength.Short)!.Show();
                    return;
                }

                DismissKeyboard(input);
                verify.Enabled = false;
                result.Text = "Result: Verifying…";
                status.Text = "Status: verifying…";
                try
                {
                    var mode = uatSwitch.Checked ? "uat" : "prod";
                    // Prefer preserved asset bytes — EditText drops RS (0x1E).
                    int code;
                    string source;
                    if (_rawBarcodeBytes != null && _rawBarcodeBytes.Length > 0)
                    {
                        source = $"bytes:{_rawBarcodeBytes.Length}";
                        code = await _verifier.VerifyAsync(
                                _rawBarcodeBytes,
                                mode: mode,
                                skipStatus: skipStatus.Checked)
                            .ConfigureAwait(true);
                    }
                    else
                    {
                        source = "EditText";
                        code = await _verifier.VerifyAsync(
                                input.Text ?? string.Empty,
                                mode: mode,
                                skipStatus: skipStatus.Checked)
                            .ConfigureAwait(true);
                    }
                    var msg =
                        $"Result code: {code}\n" +
                        $"mode={mode} skipStatus={skipStatus.Checked} via={source}\n" +
                        "1=valid  0=invalid  2=revoked  10=offline";
                    result.Text = msg;
                    status.Text = $"Status: done → {code}";
                    Toast.MakeText(this, $"Result code: {code}", ToastLength.Long)!.Show();
                }
                catch (Exception ex)
                {
                    result.Text = $"Error: {ex.Message}";
                    status.Text = "Status: error";
                    Toast.MakeText(this, result.Text, ToastLength.Long)!.Show();
                }
                finally
                {
                    verify.Enabled = _ready;
                }
            };

            try
            {
                // Process-scoped verifier: Chromium + JS warm-up starts in Application.OnCreate.
                _verifier = await DemoApplication.GetOrCreateVerifierAsync()
                    .ConfigureAwait(true);
                _ready = true;
                verify.Enabled = true;
                status.Text =
                    "Status: WebView ready — UAT Valid → Verify (expect 1), or " +
                    "Prod Real → Verify (UAT off, expect 1). " +
                    "Mode must match the sample (UAT↔sandbox, Prod↔production).";
            }
            catch (Exception ex)
            {
                _ready = false;
                verify.Enabled = false;
                status.Text = $"Status: init failed — {ex.Message}";
                Toast.MakeText(this, status.Text, ToastLength.Long)!.Show();
            }
        }

        private void OnInputTextChanged(object? sender, TextChangedEventArgs e)
        {
            if (!_suppressTextChanged)
            {
                _rawBarcodeBytes = null;
            }
        }

        protected override void OnDestroy()
        {
            // Keep the process-scoped WebView warm across Activity restarts.
            _verifier = null;
            base.OnDestroy();
        }

        private byte[] ReadAssetBytes(string assetPath)
        {
            using var stream = Assets!.Open(assetPath);
            using var ms = new MemoryStream();
            stream.CopyTo(ms);
            return ms.ToArray();
        }

        private void DismissKeyboard(View view)
        {
            var imm = GetSystemService(InputMethodService)
                as Android.Views.InputMethods.InputMethodManager;
            imm?.HideSoftInputFromWindow(view.WindowToken, 0);
            view.ClearFocus();
        }
    }
}
