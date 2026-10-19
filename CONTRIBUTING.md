# Contributing to IPTUBE

Bug fixes, compatibility updates, accessibility improvements, and documentation contributions are welcome.

## Get started

1. Fork the repository and clone your fork.
2. Install Node.js 22 or later, then run `npm ci`.
3. Create a branch: `git switch -c fix/describe-the-change`.
4. Load the `extension` folder as an unpacked extension in a desktop Chromium browser. See [installation](README.md#quick-install).
5. Make your change, run `npm run format`, then `npm run check`.
6. Build the ZIP with `npm run package` and open a pull request.

There are no runtime npm dependencies. Prettier is a pinned development dependency; `npm ci` installs the version recorded in the lockfile. `npm test` and `npm run validate` work without installing packages.

## Where changes belong

- **Settings:** add typed defaults and validation in `featureSettings.js`, then add the popup control in `popup.js`. Keep existing storage keys stable or provide a migration.
- **Desktop behavior:** use `browserFeatures.js`. Keep optional network requests in the service worker and validate inputs and responses.
- **Player methods:** use `playerQuality.js` in the MAIN world. MAIN-world scripts cannot directly use extension storage.
- **Ad rules:** edit only `extension/rules/rules_1.json`; rule IDs must be unique positive integers. Chrome generates `_metadata` locally; never commit it.
- **Content scripts:** respect `extension/manifest.json` ordering. The classic isolated-world scripts share a lexical scope; feature definitions load before `contentScript.js` starts them.
- **Theme:** edit `style.css` and `backgroundRandomizer.js`. Original SVG backgrounds and the audio icon can be regenerated with `npm run assets:generate`.
- **Development diagnostics:** `scripts/diagnostic.js` is a manual console helper, excluded from the runtime ZIP. It is not a supported video-download feature.

Paths above are inside `extension/` unless prefixed otherwise. See [the architecture and source map](README.md#how-the-browser-extension-works) and [webOS research](docs/webos-research.md).

## Validate behavior

The `tests/` folder contains regression tests that execute the real extension scripts in Node VM contexts. Browser APIs and HTTP responses are simulated so races, failures, and navigation timing are repeatable; the application behavior under assertion is not reimplemented in the tests. These are unit tests, not proof that every live YouTube page works.

Run `npm run test:verify` to check that important tests fail when counter serialization, SponsorBlock opt-in enforcement, or stale-response protection is deliberately broken in temporary copies. The production source files are not changed. Syntax and asset checks live in `npm run validate` rather than duplicating them in the test suite.

Automated tests cover settings, concurrency, SponsorBlock and navigation, but do not replace live playback checks. For runtime changes:

1. Reload the extension and refresh YouTube.
2. Check a normal video, pause/resume, and navigation to another video without a full page reload.
3. Check affected settings in an already-open tab and verify they survive reopening the popup.
4. For timeline changes, seek around 45, 46, 67, 106, 107, 138, and 149 seconds in the linked demo. Check cinematic disable and reduced motion.
5. For SponsorBlock changes, check missing data, network failure, ads, and navigation while a request is pending. Playback must continue when the service fails.

Use a separate browser profile for extension development. Load a packaged copy when you want to test exactly what users will install. Do not commit browser profiles, generated rules, local builds, credentials, or captured personal account data.

## Pull requests

Describe the concrete problem, the resulting behavior, and how you checked it. Include screenshots for visible changes and identify browser/version for playback issues. Add regression tests when behavior changes; documentation-only changes generally do not need new tests. Keep unrelated cleanup separate when possible.

Follow the existing format and run `npm run check` before requesting review. Include lockfile changes when changing development dependencies. New images must have a recorded source and redistribution terms in [the asset inventory](docs/assets.md); prefer original SVG/code assets. Do not copy GPL-licensed upstream code into this MIT project without addressing licensing first.

Be respectful, explain disagreements with evidence, and avoid posting private account data. Maintainers review contributions before merging. For release steps, see [releasing](docs/releasing.md).
