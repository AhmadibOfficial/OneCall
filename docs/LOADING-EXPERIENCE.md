# OneCall loading experience

Initial service catalogue, favourites and shared resource lists use static, theme-aware skeleton layouts. Placeholders are confined to the content area; existing navigation remains available. A single semantic loading label replaces placeholder content in the accessibility tree. Static placeholders require no animation or additional package and respect reduced-motion preferences.

Shared lists retain the last successful records during refresh and on refresh failure. Inline progress announces refresh activity; retry errors remain in the content area. Concurrent refresh triggers share a request. Synchronous errors become retryable failures, and responses after disposal do not update state. Genuine empty results display the existing empty state.

The home catalogue retains services during refresh. Changing location still clears previous-area services, and its existing request-revision guard prevents an older area's response from replacing the current one. Short actions such as sign-in and booking submission keep their local busy indicators and duplicate-submit protection. No artificial progress percentages or universal timing rules are introduced.

Regression coverage is in `apps/mobile/test/loading_states_test.dart`: navigation during initial loading, actual Home Profile navigation while the catalogue waits, retained records during refresh failure, request coalescing, retry success, synchronous exceptions, disposal, empty results and narrow dark-mode layouts with enlarged text and disabled animation.

Verification commands: `flutter analyze` and `flutter test` from `apps/mobile`. Release requires repository checks and device or browser acceptance. This source change does not activate payments, email delivery or other backend integrations.
