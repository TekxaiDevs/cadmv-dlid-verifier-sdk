// Copyright 2024 - 2026 California Department of Motor Vehicles.
// Copyright 2018 - 2026 Digital Bazaar, Inc.
// SPDX-License-Identifier: BSD-3-Clause
//
// SAMPLE ONLY — copy into your Xamarin.Android / .NET Android Activity.
// Not compiled by Cadmv.DlidVerifier.csproj (platform types required).
//
// Replace VERIFY_BASE_URL with the machine running: npm run service
// Emulator → host loopback is typically http://10.0.2.2:8787

#if false // enable when pasted into an Android app project
using System.Net.Http;
using Android.App;
using Android.Net;
using Android.OS;
using Android.Widget;
using Cadmv.DlidVerifier;

namespace Cadmv.DlidVerifier.SampleApp
{
    [Activity(Label = "CA DMV DLID Verify", MainLauncher = true)]
    public class MainActivity : Activity
    {
        const string VerifyBaseUrl = "http://10.0.2.2:8787";

        protected override void OnCreate(Bundle savedInstanceState)
        {
            base.OnCreate(savedInstanceState);

            var input = new EditText(this) { Hint = "Paste PDF417 raw text" };
            var button = new Button(this) { Text = "Verify" };
            var result = new TextView(this);

            var layout = new LinearLayout(this) { Orientation = Orientation.Vertical };
            layout.AddView(input);
            layout.AddView(button);
            layout.AddView(result);
            SetContentView(layout);

            var http = new HttpClient { Timeout = System.TimeSpan.FromSeconds(30) };
            var client = new DlidVerifierClient(http, VerifyBaseUrl);
            var online = new AndroidDeviceOnline(this);
            var orchestrator = new VerifyOrchestrator(online, client);

            button.Click += async (_, __) =>
            {
                button.Enabled = false;
                try
                {
                    var code = await orchestrator.VerifyScannedBarcodeAsync(
                        input.Text ?? string.Empty,
                        mode: "prod");
                    result.Text = $"Result code: {code}" +
                        "\n(1=valid 0=invalid 2=revoked 10=offline)" +
                        "\nNote: code 1 is barcode/crypto/status only — not physical authenticity.";
                }
                finally
                {
                    button.Enabled = true;
                }
            };
        }
    }

    sealed class AndroidDeviceOnline : IDeviceOnline
    {
        readonly Activity _activity;
        public AndroidDeviceOnline(Activity activity) => _activity = activity;
        public bool IsOnline()
        {
            var cm = (ConnectivityManager)_activity.GetSystemService(
                Android.Content.Context.ConnectivityService);
            var network = cm?.ActiveNetwork;
            if (network == null) return false;
            var caps = cm.GetNetworkCapabilities(network);
            return caps != null && (
                caps.HasTransport(Android.Net.TransportType.Wifi) ||
                caps.HasTransport(Android.Net.TransportType.Cellular) ||
                caps.HasTransport(Android.Net.TransportType.Ethernet));
        }
    }
}
#endif
