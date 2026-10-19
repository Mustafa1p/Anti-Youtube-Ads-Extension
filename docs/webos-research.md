# webOS research and desktop implementation

Reviewed repository: [webosbrew/youtube-webos](https://github.com/webosbrew/youtube-webos), commit [`f1b3b72926bb0cc312b5ceddc6a5b8c8ca081914`](https://github.com/webosbrew/youtube-webos/tree/f1b3b72926bb0cc312b5ceddc6a5b8c8ca081914), on 19 October 2026.

## Execution model

The TV app launches YouTube's leanback interface and layers app-specific hooks and modules onto that environment. A desktop extension instead has a service worker, page scripts in the MAIN world, and content scripts in an isolated world. TV DOM selectors, private TV player objects, and platform service calls do not map directly to the desktop site.

Source entry points: [`src/utils.js`](https://github.com/webosbrew/youtube-webos/blob/f1b3b72926bb0cc312b5ceddc6a5b8c8ca081914/src/utils.js), [`src/userScript.ts`](https://github.com/webosbrew/youtube-webos/blob/f1b3b72926bb0cc312b5ceddc6a5b8c8ca081914/src/userScript.ts), and [`src/player_api`](https://github.com/webosbrew/youtube-webos/tree/f1b3b72926bb0cc312b5ceddc6a5b8c8ca081914/src/player_api).

## Feature map

| Upstream module                                                | Desktop treatment                                                                                                           |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `adblock.js`, `hooks/`                                         | Retain this extension's existing network rules and response patches; avoid layering another global JSON patch               |
| `config.js`, `ui.js`                                           | New typed local preferences and checkbox controls in the popup                                                              |
| `sponsorblock.js`                                              | Independent implementation: background hash lookup, validated categories/ranges, bounded cache, and playback-event skipping |
| `video-quality.ts`                                             | Desktop MAIN-world player bridge; choose the highest exposed quality and request it once per video/quality combination      |
| `thumbnail-quality.ts`                                         | Probe ordinary desktop thumbnail images and replace only if the element still references the original image                 |
| `watch.js`                                                     | Local-time overlay that can move into the fullscreen element                                                                |
| `shorts.js`, `remove-endscreen.ts`                             | Existing desktop filtering retained                                                                                         |
| Logo hiding and animations                                     | Optional logo hiding and reduced theme motion; existing animated theme remains                                              |
| Audio-only remote action                                       | Popup audio mode hides the picture; it does not alter media transport                                                       |
| `auto-account-select.ts`                                       | Not ported: TV account-selection flow                                                                                       |
| `screensaver-fix.ts`, TV casting, remote navigation, autostart | Not ported: platform-specific behavior                                                                                      |

Module links can be resolved against the pinned [source directory](https://github.com/webosbrew/youtube-webos/tree/f1b3b72926bb0cc312b5ceddc6a5b8c8ca081914/src). These are implementation summaries, not copied upstream code. Upstream's GPL-3.0-only files are not included in the extension package.

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
