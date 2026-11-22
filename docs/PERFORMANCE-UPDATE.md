# OneCall performance update

This update removes avoidable serial work without caching private data or changing approval rules.

- Home starts service and favourites requests together after loading the saved location.
- The client shares simultaneous reads for the same public catalogue URL. Different locations remain isolated. Completed responses are not cached; subsequent refreshes always contact the server. Failed requests are removed so retries work.
- Service availability starts the independent provider-coverage and parcel-route database queries together. Existing active-user, provider approval, agent approval and route status filters are unchanged.

Tests cover one request serving concurrent callers, fresh subsequent refreshes, isolation across cities, shared failure recovery, favourites starting before a pending catalogue finishes, parallel database reads and unchanged provider counts.

No measured end-to-end latency improvement is claimed. Render's available HTTP latency series was empty during inspection. Validate cold and warm startup, sign-in, catalogue loading and booking submission on a physical phone over Wi-Fi and mobile data before setting production latency targets.

Hosting findings on 22 November 2026: the API remains on the free compute plan, which may spin down after inactivity. Database metadata reports expiry at 2026-11-22T12:43:36Z. Preserve the existing database and accounts; select an approved ongoing hosting budget before changing paid plans. UI placeholders do not remove server startup delay. No billing or infrastructure change is included here.

The current distributed APK is a debug build. A performance-ready release build needs the final owned application ID and private upload signing configuration already enforced by the Android project. These release checks have not been bypassed.
