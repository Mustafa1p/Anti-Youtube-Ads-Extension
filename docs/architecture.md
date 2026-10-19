# Browser implementation notes

This document describes the desktop extension's runtime design and compatibility boundaries.

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

## Validation boundaries

Node tests use mocked browser APIs for deterministic concurrency and playback cases. Browser checks use an actual unpacked Chromium extension, its service worker, popup, and the linked desktop YouTube video. Successful quality requests and rendered timeline phases do not establish that every account, browser release, video, or ad format will work.
