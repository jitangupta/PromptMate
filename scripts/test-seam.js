// Testability seam — build-time gated. process.env.BUILD is replaced by
// @rollup/plugin-replace at bundle time; in production builds the if-block
// evaluates to false and the dead-code eliminator removes it entirely.
// This file must never ship active code in a production bundle.
//
// Usage: navigate to the host site with
//   ?pm_test_key=<storageKey>&pm_test_value=<urlEncodedJSON>
// The content script writes the decoded value to chrome.storage.local,
// strips the parameters, and reloads — giving agents a normal page load
// from the seeded state with no DevTools required.

if (process.env.BUILD !== 'production') {
  const ALLOWED_TEST_KEYS = new Set([
    'promptmate_cache',
    'promptmate_groups',
    'promptmate_badges',
    'promptmate_context',
    'promptmate_context_enabled',
    'promptmate.composePrefs',
    'promptmate.onboarding',
    'promptmate.whatsNew',
    'promptmate.ratingPrompt',
  ]);

  const params = new URLSearchParams(window.location.search);
  const testKey = params.get('pm_test_key');
  const testValue = params.get('pm_test_value');

  if (testKey && testValue && ALLOWED_TEST_KEYS.has(testKey)) {
    let parsed;
    try {
      parsed = JSON.parse(testValue);
    } catch {
      console.warn('[pm_test] Invalid JSON for key', testKey);
    }

    if (parsed !== undefined) {
      chrome.storage.local.set({ [testKey]: parsed }, () => {
        if (chrome.runtime.lastError) {
          console.warn('[pm_test] Storage write failed:', chrome.runtime.lastError.message);
          return;
        }
        const url = new URL(window.location.href);
        url.searchParams.delete('pm_test_key');
        url.searchParams.delete('pm_test_value');
        window.history.replaceState({}, '', url.toString());
        window.location.reload();
      });
    }
  }
}
