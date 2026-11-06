# Changelog

## 2.4.0 — 2026-11-06

- Add automatic GitHub release checks every six hours, a toolbar update badge, manual checking, and an update download/install guide. Unpacked installs require replacing files and reloading; no remote code is executed.
- Add a nine-card theme picker with persistent, immediate switching across open YouTube tabs.
- Add Breaking Bad, Game of Thrones, GTA VI, Modern Warfare 4, Xbox, PS5, and Netflix palettes, branding, backgrounds, buttons, menus, and loading/progress controls.
- Add Original YouTube restoration and isolate Stranger Things styles and effects to its selected theme.
- Bundle the supplied logo assets, record their sources, and add theme storage and Chromium runtime regression checks.

## 2.3.2 — 2026-11-04

- Fail the browser smoke test when its service worker logs console errors, before reporting success.
- Explain how to install Playwright and Chromium when the optional browser test dependency is missing.
- Use full Chromium for headless extension testing and add regression coverage for smoke-test success and failure paths.

## 2.3.1 — 2026-11-04

- Replace broad page API, visitor identity, integrity and enforcement patches with exact successful-player ad cleanup. Preserve native playback errors and verification UI.
- Add persistent ad-blocking pause/resume and an explicit pause-and-reload button for recognized enforcement warnings. Restore owned page hooks when paused.
- Remove automatic YouTube site-data deletion and the browsing-data permission.
- Remove speculative stream/telemetry rules, scope ad-serving rules to YouTube initiators, and leave ad transitions to native skip controls.
- Add behavioral regressions and source-backed research/maintenance notes.

## 2.3.0 — Unreleased

### Added

- Optional SponsorBlock with category selection, prefix lookup, caching, and navigation-safe skipping.
- Highest-available-quality preference, audio presentation mode, thumbnail upgrades, local clock, logo hiding, and reduced theme motion.
- Settings popup with a direct special-video demo link.
- Original procedural SVG backgrounds and spatial-audio icon, with a reproducible asset generator.
- Automated checks, deterministic runtime packaging, CI build artifacts, contribution instructions, and release guidance.

### Changed

- Split content-script configuration, sidebar filtering, media controls, and branding into focused files.
- Share video settings and validation between the popup and the theme.
- Serialize blocked-count updates and resets to avoid lost increments.
- Document the special video timeline, optional-service privacy, and browser compatibility boundaries.
- Remove unused scripting/active-tab permissions and replace the branded audio button with a neutral spatial-audio control.
- Exclude browser-generated metadata, duplicate rules, development diagnostics, and local artifacts from distribution.

### Preserved

- Existing network rules and early response patches.
- Stranger Things themed timeline for video `SkcO47UDzzY`, user-configured ambilight, loop controls, and volume boost.

Earlier repository history predates this changelog; no older release contents or dates are inferred here.
