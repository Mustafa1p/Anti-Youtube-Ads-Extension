// Fetch release metadata only. Extension code is never downloaded or evaluated here.
const UpdateService = (() => {
  const REPOSITORY = "Mustafa1p/Anti-Youtube-Ads-Extension";
  const API_URL = `https://api.github.com/repos/${REPOSITORY}/releases/latest`;
  const RELEASES_URL = `https://github.com/${REPOSITORY}/releases/latest`;
  const STORAGE_KEY = "iptubeUpdateState";
  const ALARM_NAME = "iptube-release-check";
  const INTERVAL_MS = 6 * 60 * 60 * 1000;
  let inFlight;

  function versionParts(value) {
    if (typeof value !== "string" || !/^\d+(?:\.\d+){0,3}$/.test(value))
      return null;
    const parts = value.split(".").map(Number);
    return parts.every((part) => part <= 65535) ? parts : null;
  }
  function isNewer(candidate, installed) {
    const next = versionParts(candidate),
      current = versionParts(installed);
    if (!next || !current) return false;
    for (let i = 0; i < 4; i++) {
      const delta = (next[i] || 0) - (current[i] || 0);
      if (delta) return delta > 0;
    }
    return false;
  }
  function parseRelease(release) {
    if (
      !release ||
      release.draft ||
      release.prerelease ||
      typeof release.tag_name !== "string"
    )
      throw new Error("Invalid stable release");
    const tag = release.tag_name;
    const version = tag.replace(/^v/, "");
    if (!versionParts(version)) throw new Error("Invalid release version");
    const base = `https://github.com/${REPOSITORY}/releases`;
    const releaseUrl = `${base}/tag/${tag}`;
    const downloadUrl = `${base}/download/${tag}/iptube-browser-extension.zip`;
    const asset = release.assets?.find(
      (item) =>
        item.name === "iptube-browser-extension.zip" &&
        item.browser_download_url === downloadUrl &&
        item.state === "uploaded" &&
        item.size > 0
    );
    if (release.html_url !== releaseUrl || !asset)
      throw new Error("Release package is not ready");
    return { latestVersion: version, releaseUrl, downloadUrl };
  }
  function currentVersion() {
    return chrome.runtime.getManifest().version;
  }
  async function status() {
    const saved = (await chrome.storage.local.get([STORAGE_KEY]))[STORAGE_KEY];
    // Revalidate cached links too: storage is data, never an arbitrary navigation target.
    let release = {};
    if (saved?.latestVersion && versionParts(saved.latestVersion)) {
      for (const tag of [`v${saved.latestVersion}`, saved.latestVersion]) {
        try {
          release = parseRelease({
            tag_name: tag,
            html_url: saved.releaseUrl,
            assets: [
              {
                name: "iptube-browser-extension.zip",
                browser_download_url: saved.downloadUrl,
                state: "uploaded",
                size: 1
              }
            ]
          });
          break;
        } catch {
          /* Ignore invalid cached metadata. */
        }
      }
    }
    return {
      ...release,
      currentVersion: currentVersion(),
      available: isNewer(release.latestVersion, currentVersion()),
      checkedAt: Number.isFinite(saved?.checkedAt) ? saved.checkedAt : 0,
      attemptedAt: Number.isFinite(saved?.attemptedAt) ? saved.attemptedAt : 0,
      error: saved?.error === true,
      releasesUrl: RELEASES_URL
    };
  }
  async function badge(state) {
    await chrome.action.setBadgeText({ text: state.available ? "NEW" : "" });
    if (state.available)
      await chrome.action.setBadgeBackgroundColor({ color: "#c51f43" });
  }
  async function check(force = false) {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      const previous = await status();
      const now = Date.now();
      if (
        !force &&
        previous.attemptedAt > 0 &&
        now - previous.attemptedAt < INTERVAL_MS
      ) {
        await badge(previous);
        return previous;
      }
      let next;
      try {
        const response = await fetch(API_URL, {
          headers: { Accept: "application/vnd.github+json" },
          credentials: "omit",
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(15000)
        });
        if (!response.ok) throw new Error("Release check unavailable");
        next = {
          ...parseRelease(await response.json()),
          checkedAt: now,
          attemptedAt: now,
          error: false
        };
      } catch {
        // Preserve a previously found update when offline/rate limited.
        next = { ...previous, attemptedAt: now, error: true };
      }
      await chrome.storage.local.set({ [STORAGE_KEY]: next });
      const result = await status();
      await badge(result);
      return result;
    })().finally(() => {
      inFlight = undefined;
    });
    return inFlight;
  }
  async function start() {
    if (!(await chrome.alarms.get(ALARM_NAME)))
      await chrome.alarms.create(ALARM_NAME, {
        delayInMinutes: 1,
        periodInMinutes: 360
      });
    await badge(await status());
  }
  return Object.freeze({
    STORAGE_KEY,
    ALARM_NAME,
    API_URL,
    isNewer,
    parseRelease,
    status,
    check,
    start
  });
})();
