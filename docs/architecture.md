# Browser implementation notes

This document describes the desktop extension's runtime design and compatibility boundaries.

## Ad cleanup and recovery

`playbackSafety.js` runs at document_start in the isolated world and reads `adBlockingEnabled`. The MAIN-world cleanup remains inactive until that stored preference is available. It observes one root attribute, installs narrow parsing hooks when enabled, and restores hooks it still owns when paused. It never changes request bodies, visitor headers, integrity flags, stream URLs, blocked playback states or site storage. Initial inline responses may arrive before settings and escape cleanup.

`adBlockingService.js` serializes mode changes with network ruleset updates. Static rules default off; the worker reconciles the stored preference on startup and install/update. A successful toggle reply confirms both the ruleset change and saved page preference. The popup requests a reload to discard earlier response/DOM mutations. Recognized enforcement renderers retain their native UI and get an explicit recovery button; no automatic retry loop runs.

DOM ad cleanup uses visible native skip controls without seeking or changing player ad classes. Remaining blocking rules target explicit ad-serving endpoints and have a YouTube initiator scope. See [research and limitations](youtube-playback-research.md) for sources, failure mechanisms, and the account-level validation still needed.

## Browser-specific decisions

### SponsorBlock

Requests are constructed in the extension service worker with an HTTPS URL fixed to `sponsorblock.inf.re`. The caller supplies only a validated 11-character video ID. The worker re-reads the saved opt-in and categories, computes a four-character SHA-256 prefix, and filters the response to the exact video. This keeps cross-origin access out of the page world. See [Chrome's cross-origin request documentation](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests).

Only skip actions with finite, increasing, nonnegative timestamps are accepted. Cached results expire after 30 minutes, in-flight requests are shared, and the cache is bounded to 100 entries. Missing data returns an empty segment list; failed requests are not cached. Requests omit credentials and time out after eight seconds.

The content script ignores responses from an older navigation or settings generation. It checks the current video ID before seeking, ignores ad playback, and joins overlapping segment intervals. Playback continues unchanged if the service fails. This implementation does not submit votes, send skip telemetry, or edit community segments.

### Quality and visual modes

The MAIN-world bridge accepts only a typed boolean preference from the same window and origin. Desktop YouTube methods are private and may change. Available quality is requested once per video/quality combination; disabling the feature requests automatic quality selection. No claims are made about unlocking paid formats.

Audio mode changes presentation only. Thumbnails are upgraded only for ordinary `i.ytimg.com` video images; transformed/A-B variants are left alone. Missing or placeholder high-resolution images leave the original image intact, and disabling the option restores images still owned by the feature.

### Existing cinematic behavior

The special video remains `SkcO47UDzzY`. It has priority over user-configured ambilight videos. Phase boundaries are 45, 46, 67, 106, 107, 138, and 149 seconds. The effect follows `currentTime`, including seeking, and the mode returns to normal after navigation. The new preference allows both timeline and ambilight effects to be disabled from the popup.

### Theme Studio

`themeSettings.js` defines the allowlisted nine-theme catalog and shared palette roles. `iptubeTheme` is stored in `chrome.storage.local`; missing, deleted, or invalid values use Stranger Things for compatibility. Initial reads carry a revision guard so a newer storage event wins over a stale response. The popup serializes writes and reports save failures without committing an unsaved selection.

`themeController.js` sets the root theme attribute and palette variables, retains the native logo DOM, and observes header replacement with one queued animation-frame refresh. Themes temporarily opt into YouTube's native dark component variants; Original restores the starting `dark` attribute and removes all owned palette tokens and branding. No YouTube appearance preference or cookie is changed. `style.css` is scoped exclusively to Stranger Things; `themes.css` scopes all shared rules away from Original and supports both Polymer and generated component names. Special timeline/ambilight state is cleared synchronously on theme changes and runs only in Stranger Things.

The reference direction comes from the supplied brand logos and the existing Stranger Things interface. The grid uses actual local logos and selected-state checks; YouTube content retains native imagery and familiar layout. Breaking Bad uses chemical green, a faint periodic grid, monospace display type, and square controls. Game of Thrones uses ice/steel, gold accents, serif titles, and sharp edges. GTA VI uses pink/aqua atmosphere and rounded controls. Modern Warfare uses charcoal/khaki, yellow accents, diagonal texture, and narrow display type. Xbox uses green radial light; PS5 uses blue/white curves; Netflix uses red/black and compact rectangular controls. Text remains in high-contrast palette roles; display fonts are limited to headings and branding.

### GitHub release checks

`updateService.js` reads only the public latest-stable-release endpoint for the fixed repository. It validates the numeric version, exact release URL, and exact uploaded ZIP asset URL before persisting metadata. Concurrent requests share one promise; automatic attempts are cached for six hours, including failures. Manual checks bypass the interval. Cached metadata is revalidated before display, and availability is recomputed against the running manifest so an installed update clears the badge.

A persistent six-hour `chrome.alarms` schedule is recreated when missing on service-worker startup. The popup checks on open, shows a download action only for a newer packaged release, and explains manual unpacked installation. Update messages are accepted only from extension pages; YouTube content scripts cannot trigger forced checks. The new `alarms` permission schedules checks; the `api.github.com` host permission permits public metadata reads. No GitHub token, cookies, video information, remote code execution, filesystem access, or silent replacement is involved.

## Validation boundaries

Node tests use mocked browser APIs for deterministic concurrency and playback cases. Browser checks use an actual unpacked Chromium extension, its service worker, popup, and the linked desktop YouTube video. Successful quality requests and rendered timeline phases do not establish that every account, browser release, video, or ad format will work.
