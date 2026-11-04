# YouTube playback reliability investigation

Investigated 4 November 2026. This is a maintenance strategy, not a permanent anti-detection guarantee. The affected signed-in account was not available for reproduction; the findings below distinguish code defects from possible platform behavior.

## What the evidence supports

YouTube explicitly documents that continued ad blocking can result in blocked playback. It also says extensions can affect playback. That supports the reported warning, but does not prove that an account is flagged after a fixed number of days or reveal YouTube's private detection algorithm. Source: [YouTube Help](https://support.google.com/youtube/answer/14129599?hl=en).

The [yt-dlp PO Token Guide](https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide) describes playback attestation, HTTP 403 failures, and tokens bound to a session or video. It documents an extractor rather than this browser extension. The applicable engineering inference is to preserve the browser's original identity, request headers, cookies and integrity data. Inventing a visitor ID is not evidence of a valid session and is not a reliable account-reset mechanism.

[uBlock Origin's troubleshooting thread](https://github.com/uBlockOrigin/uAssets/issues/20586) recommends current default filters, a clean profile, and testing without other blockers. It is an archived thread, useful for method rather than as a current patch. Its [Quick fixes list](https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/quick-fixes.txt) advertises an eight-hour expiry: maintained filters are an ongoing process. The [maintainer discussion of server-side ads](https://github.com/uBlockOrigin/uBlock-issues/discussions/3322) describes targeted rollout differences and browser-specific breakage. A warning disappearing from the DOM does not establish that the server returned playable video.

Brave's [May 2026 playback regression report](https://github.com/brave/brave-browser/issues/55793) attributes breakage to a YouTube counter-ad filter and describes exempting/tweaking it. This is a concrete example of a fix becoming a compatibility problem. [Brave's filter repository](https://github.com/brave/adblock-lists) builds on community-maintained lists. Its [iOS-specific list](https://github.com/brave/adblock-lists/blob/master/brave-lists/brave-ios-specific.txt) includes exact player-ad paths; that is useful evidence for narrow pruning, not proof that copying an iOS rule will work on desktop. [EasyList's older YouTube notes](https://github.com/easylist/easylist/wiki/Youtube-Issues) also show exact player paths; they are historical context, not a current universal bypass.

[Chrome's declarativeNetRequest documentation](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest) supports runtime ruleset enable/disable and explains static ruleset persistence. The extension therefore reconciles saved mode when its worker starts and after installation/update, and waits for network-rule changes before confirming a toggle.

## Defects found in this repository

| Old behavior                                                                                     | Failure mechanism                                                                               | Change                                                                                                            |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Fake `x-goog-visitor-id`, changed player bodies and integrity flags                              | Potential disagreement with real session/attestation; unverified anti-detection assumptions     | Preserve requests, visitor data, cookies, configuration and integrity flags                                       |
| Force blocked `playabilityStatus` to `OK`                                                        | Missing or invalid streams remain missing; useful recovery UI disappears                        | Preserve every non-OK response exactly                                                                            |
| Recursive ad/bot/verification key deletion                                                       | Can remove legitimate UI, sign-in requirements or adaptive stream data                          | Prune only `adPlacements`, `playerAds`, `adSlots` on successful player objects                                    |
| Global fetch/XHR/beacon/postMessage and native-string spoofing                                   | Broad API contract changes and interference with other code                                     | Remove those hooks; restore remaining parse/json hooks when paused                                                |
| Storage/cookie/IndexedDB deletion, service-worker unregistering, install-time browsing-data wipe | Lost preferences and repeated site-state churn, with no evidence of clearing server enforcement | Remove sanitizer and browsing-data permission                                                                     |
| Guessed video URL blocks (`ctier=L`, `_ad_`, `oad`)                                              | Can interrupt media and hang the player; scopes differed from upstream rules                    | Remove video-stream blocking and telemetry/survey guesses; scope remaining ad-serving rules to YouTube initiators |
| Remove ad UI, warning dialogs and every overlay backdrop                                         | Can leave hidden errors, unskippable states or broken modal interaction                         | Keep native player UI and enforcement messages; use visible native skip buttons only                              |
| Seek to `video.duration`, clear ad classes                                                       | Incorrect player element, non-finite live durations, premature content completion               | Never seek or change player ad state for ad cleanup                                                               |
| No independent ad-blocking off switch                                                            | User had to disable or uninstall all features                                                   | Persistent popup toggle plus recovery button for recognized enforcement renderers                                 |

## Resulting behavior and limits

- Settings initially fail open: page pruning waits for the stored mode. Early inline player data can therefore escape cleanup. This deliberately favors playback over blocking every ad.
- Enabled mode uses exact successful-player paths in JSON parsing, YouTube player/next `Response.json()` responses, and `ytInitialPlayerResponse`. It does not rewrite arbitrary text or XHR bodies. Revivers retain their own transformation contract.
- Paused mode disables this extension's network rules and DOM ad cleanup, and restores its parse/json/global-property hooks where they are still owned by this extension. Reload open YouTube tabs to remove earlier mutations. Visual and optional playback features remain available.
- A recognized enforcement element shows a recovery button. The user explicitly pauses blocking and reloads; there is no automatic reload loop or silent allowance of ads. If YouTube changes its warning markup, the popup remains available.
- Other extensions, browser shields, DNS blockers, account/server restrictions and network errors can still affect playback. This switch controls only IPTUBE. Complete any real sign-in/verification flow rather than hiding it.
- Same-stream/server-inserted ads and future player schemas may still show ads. No local extension can promise lifetime compatibility with a changing remote service.

## Verification

Automated Node regressions cover successful response pruning, full non-OK response preservation, native API preservation/restoration, disabled/unknown settings, malformed JSON/revivers, response URL scoping, storage races, rapid toggles, rule-update/storage failures, and visible native skip buttons.

`npm run test:browser` reproduces the optional Chromium fixture check in `scripts/browser-smoke.cjs`. It requires Playwright and its Chromium browser in the test environment. For an existing external installation, set `PLAYWRIGHT_MODULE` to the module path and optionally `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to its browser executable. The script uses an isolated test profile and never opens your signed-in browser profile.

To install the optional test tools locally, run `npm install --no-save playwright`, then `npx playwright install chromium`, followed by `npm run test:browser`. The test uses full Chromium in headless mode so extensions can load. Collected service worker console errors fail the test before it reports success; missing Playwright produces installation guidance and exit code 1.

An actual unpacked Chromium extension was tested against an intercepted YouTube-origin fixture. The worker and popup loaded; enabling/disabling changed `getEnabledRulesets()`; paused mode survived reloads and popup reopening; a simulated enforcement renderer exposed the recovery button, which paused network blocking and reloaded. This fixture verifies extension wiring, not real ad blocking, account enforcement, long-term reliability or live-video playback.

For an affected account, reload the updated extension and open a fresh YouTube tab. Test the same ordinary video with blocking on, then paused and reloaded. Compare a fresh browser profile with only this extension. Test preroll/midroll transitions, SPA navigation, Shorts, live playback, captions, fullscreen, age/sign-in requirements, browser restart and extension update. If a failure remains, record browser/extension versions, whether it also occurs paused, player error text, and HTTP status codes for player/media requests. Do not share cookies, authorization headers, PO tokens or full signed media URLs.

## Maintenance policy

Treat each new breakage as a reproducible case: determine whether it is a blocked player response, media authorization failure, ad transition, conflicting blocker or extension exception. Add a behavioral regression before changing a rule. Keep versioned local rules and ship reviewed extension updates; do not download executable fixes. If a patch harms playback, disable the responsible behavior and preserve the user's recovery route.
