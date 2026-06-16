// Copy this file to `secrets.local.js` and fill in the values from your
// Google Cloud Console OAuth 2.0 "Web application" client.
//
// `secrets.local.js` is gitignored. The real values get bundled into
// dist/background.bundle.js at build time and shipped with the extension —
// PKCE + scope limits are the actual defense, the "secret" cannot stay
// secret in any installed client. We just don't want it in git history.
//
// Authorized redirect URI for the OAuth client must be:
//   https://oknglgpcglngpaobpjndcaaljdchmgai.chromiumapp.org/

export const WEB_CLIENT_ID = "REPLACE_WITH_GCP_WEB_CLIENT_ID";
export const WEB_CLIENT_SECRET = "REPLACE_WITH_GCP_WEB_CLIENT_SECRET";

// GA4 usage analytics (optional — analytics are silently disabled while
// these are placeholders). From Google Analytics: Admin → Data Streams →
// pick the Web stream → "Measurement ID" (G-XXXXXXXXXX), then on the same
// page "Measurement Protocol API secrets" → Create → copy the secret value.
export const GA4_MEASUREMENT_ID = "REPLACE_WITH_GA4_MEASUREMENT_ID";
export const GA4_API_SECRET = "REPLACE_WITH_GA4_API_SECRET";
