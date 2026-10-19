# Publishing and releasing

## Prepare a contribution

Follow [CONTRIBUTING.md](../CONTRIBUTING.md). Commit the source, documentation, original SVG assets, tests, workflow files, and `package-lock.json`. Leave `node_modules`, `dist`, `output`, browser profiles, and Chrome `_metadata` out of Git.

`npm run check` checks formatting, package/manifest version consistency, runtime references, JavaScript syntax, network-rule IDs, documentation images, and the test suite. `npm run package` validates again and produces a ZIP from manifest-referenced runtime files and their local script dependencies. It also includes the README, license, and documentation.

## Before publishing a release

1. Choose the version and update **both** `package.json` and `extension/manifest.json`. Run `npm install --package-lock-only --ignore-scripts` to synchronize lockfile metadata.
2. Update visible version labels in `popup.html` and `backgroundRandomizer.js`, and move the changelog's Unreleased entry to the release version and date.
3. Run `npm ci`, `npm run check`, and `npm run package` from a fresh checkout.
4. Extract `dist/iptube-browser-extension.zip`, load its `extension` folder in a separate Chromium profile, and perform the [manual checks](../CONTRIBUTING.md#validate-behavior). Record the browser version and results in the release notes.
5. Check the [asset inventory](assets.md), settings defaults, permissions, README, and versioned changes.
6. Review the diff and confirm the GitHub Actions checks pass after pushing the branch. Open/merge a pull request using the repository's review process.

## Publish on GitHub

The CI workflow tests supported Node versions on Linux and Windows. The Linux/Node 22 job uploads the install ZIP as an Actions artifact. Artifacts are useful for reviewing branches and require GitHub access to download; they are not automatically public Releases.

After the reviewed code is merged, a maintainer can create a GitHub Release with tag `v<version>`, add the tested ZIP as an asset, and use the changelog plus manual test results as release notes. This project does not automatically push tags or publish releases.

The README currently links its download badge to the source ZIP of `main`. Once releases exist, maintainers may point it to the release asset. Keep a working source-download option and clear unpacked-install instructions. A README cannot install an extension automatically.

GitHub publication and browser-store publication are separate. This repository supplies an unpacked Chromium extension; no store listing or signed browser package is claimed.
