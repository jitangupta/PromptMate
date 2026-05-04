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
