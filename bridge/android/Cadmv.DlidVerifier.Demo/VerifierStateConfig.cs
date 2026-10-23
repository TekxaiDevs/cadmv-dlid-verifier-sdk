// Copyright 2024 - 2026 California Department of Motor Vehicles.
// Copyright 2018 - 2026 Digital Bazaar, Inc.
// SPDX-License-Identifier: BSD-3-Clause

namespace Cadmv.DlidVerifier
{
    /// <summary>
    /// Per-state configuration so future jurisdictions reuse the WebView host
    /// and only swap the asset path / default mode / wrapper bundle.
    /// </summary>
    public sealed class VerifierStateConfig
    {
        public static VerifierStateConfig California { get; } = new VerifierStateConfig(
            stateId: "CA",
            assetSubPath: "verifier",
            htmlFileName: "verifier.html",
            defaultMode: "prod");

        public VerifierStateConfig(
            string stateId,
            string assetSubPath,
            string htmlFileName,
            string defaultMode)
        {
            StateId = stateId;
            AssetSubPath = assetSubPath;
            HtmlFileName = htmlFileName;
            DefaultMode = defaultMode;
        }

        public string StateId { get; }
        public string AssetSubPath { get; }
        public string HtmlFileName { get; }
        public string DefaultMode { get; }

        /// <summary>
        /// WebViewAssetLoader secure origin + path to the host HTML.
        /// </summary>
        public string HostPageUrl =>
            $"https://appassets.androidplatform.net/assets/{AssetSubPath}/{HtmlFileName}";
    }
}
