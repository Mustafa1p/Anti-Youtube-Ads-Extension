const BrowserFeatures = (() => {
  let settings = FeatureSettings.normalize();
  let active = false;
  let video = null;
  let videoId = null;
  let generation = 0;
  let segments = [];
  let clock = null;
  let timer = null;
  let toastTimeout = null;
  const thumbnails = new Map();
  let attemptedThumbnails = new WeakMap();

  function announce(text) {
    let toast = document.getElementById("iptube-feature-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "iptube-feature-toast";
      toast.setAttribute("role", "status");
      (document.fullscreenElement || document.body).appendChild(toast);
    }
    toast.textContent = text;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.remove(), 3500);
  }

  function skipSegment() {
    const player = document.getElementById("movie_player");
    if (
      !settings.sponsorBlock ||
      !video ||
      video.paused ||
      video.seeking ||
      new URLSearchParams(location.search).get("v") !== videoId ||
      location.pathname !== "/watch" ||
      !Number.isFinite(video.duration) ||
      !player ||
      player.classList.contains("ad-showing") ||
      player.classList.contains("ad-interrupting")
    )
      return;
    // Merge overlapping ranges at playback time to avoid repeated partial skips.
    const start = video.currentTime;
    let end = start;
    for (const item of segments) {
      if (item.segment[0] <= end && item.segment[1] > end)
        end = item.segment[1];
    }
    if (end > start) {
      video.currentTime = Math.min(end, video.duration);
      announce(`Skipped ${Math.round(end - start)}s · SponsorBlock`);
    }
  }

  function refreshSegments() {
    const requestGeneration = ++generation;
    segments = [];
    if (!settings.sponsorBlock || !videoId) return;
    chrome.runtime.sendMessage(
      { type: "GET_SPONSOR_SEGMENTS", videoId },
      (response) => {
        const error = chrome.runtime.lastError;
        if (!active || requestGeneration !== generation) return;
        if (error || response?.error) {
          console.debug(
            "[IPTUBE] SponsorBlock unavailable",
            error?.message || response?.error
          );
          return;
        }
        segments = Array.isArray(response?.segments) ? response.segments : [];
        skipSegment();
      }
    );
  }

  function syncVideo() {
    const nextId =
      location.pathname === "/watch"
        ? new URLSearchParams(location.search).get("v")
        : null;
    const nextVideo = nextId
      ? document.querySelector("video.html5-main-video, video")
      : null;
    if (nextVideo !== video) {
      video?.removeEventListener("timeupdate", skipSegment);
      video?.removeEventListener("playing", skipSegment);
      video = nextVideo;
      video?.addEventListener("timeupdate", skipSegment);
      video?.addEventListener("playing", skipSegment);
    }
    if (nextId !== videoId) {
      videoId = nextId;
      refreshSegments();
    }
  }

  function upgradeThumbnails() {
    if (!settings.upgradeThumbnails) return;
    for (const image of document.querySelectorAll(
      "ytd-thumbnail img, yt-thumbnail-view-model img"
    )) {
      const original = image.getAttribute("src");
      if (!original || attemptedThumbnails.get(image) === original) continue;
      attemptedThumbnails.set(image, original);
      let url;
      try {
        url = new URL(original);
      } catch {
        continue;
      }
      if (
        url.hostname !== "i.ytimg.com" ||
        !/^\/vi(?:_webp)?\/[\w-]{11}\/(default|mqdefault|hqdefault|sddefault)\.(jpg|webp)$/.test(
          url.pathname
        )
      )
        continue;
      url.pathname = url.pathname.replace(
        /\/[^/]+$/,
        `/maxresdefault.${url.pathname.endsWith(".webp") ? "webp" : "jpg"}`
      );
      url.search = "";
      const probe = new Image();
      probe.onload = () => {
        if (
          !active ||
          !settings.upgradeThumbnails ||
          probe.naturalWidth <= 120 ||
          image.getAttribute("src") !== original
        )
          return;
        thumbnails.set(image, { original, upgraded: url.href });
        attemptedThumbnails.set(image, url.href);
        image.src = url.href;
      };
      probe.src = url.href;
    }
    for (const image of thumbnails.keys())
      if (!image.isConnected) thumbnails.delete(image);
  }

  function restoreThumbnails() {
    for (const [image, { original, upgraded }] of thumbnails) {
      if (image.getAttribute("src") === upgraded) image.src = original;
    }
    thumbnails.clear();
    attemptedThumbnails = new WeakMap();
  }

  function updateClock() {
    if (!settings.showClock) {
      clock?.remove();
      clock = null;
      return;
    }
    if (!clock?.isConnected) {
      clock = document.createElement("time");
      clock.id = "iptube-clock";
      clock.setAttribute("aria-label", "Local time");
      document.body.appendChild(clock);
    }
    const parent = document.fullscreenElement || document.body;
    if (clock.parentElement !== parent) parent.appendChild(clock);
    const now = new Date();
    clock.dateTime = now.toISOString();
    const text = now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });
    if (clock.textContent !== text) clock.textContent = text;
  }

  function applySettings(next) {
    settings = FeatureSettings.normalize(next);
    document.documentElement.classList.toggle(
      "iptube-audio-only",
      settings.audioOnly
    );
    document.documentElement.classList.toggle(
      "iptube-hide-logo",
      settings.hideLogo
    );
    document.documentElement.classList.toggle(
      "iptube-reduce-motion",
      settings.reduceMotion
    );
    window.postMessage(
      {
        source: "IPTUBE_SETTINGS",
        type: "QUALITY_PREFERENCE",
        enabled: settings.highestQuality
      },
      location.origin
    );
    if (!settings.upgradeThumbnails) restoreThumbnails();
    syncVideo();
    refreshSegments();
    updateClock();
    upgradeThumbnails();
  }

  function onStorageChange(changes, area) {
    if (area === "local" && changes[FeatureSettings.STORAGE_KEY])
      applySettings(changes[FeatureSettings.STORAGE_KEY].newValue);
  }

  function refresh() {
    if (!active) return;
    syncVideo();
    updateClock();
    upgradeThumbnails();
  }

  function onNavigationStart() {
    generation++;
    segments = [];
    videoId = null;
  }

  function start() {
    if (active) return;
    active = true;
    chrome.storage.onChanged.addListener(onStorageChange);
    document.addEventListener("yt-navigate-finish", refresh);
    document.addEventListener("yt-navigate-start", onNavigationStart);
    FeatureSettings.load()
      .then((value) => {
        if (active) applySettings(value);
      })
      .catch((error) => console.debug("[IPTUBE] Settings unavailable", error));
    timer = setInterval(refresh, 1000);
  }

  function stop() {
    active = false;
    generation++;
    clearInterval(timer);
    clearTimeout(toastTimeout);
    chrome.storage.onChanged.removeListener(onStorageChange);
    document.removeEventListener("yt-navigate-finish", refresh);
    document.removeEventListener("yt-navigate-start", onNavigationStart);
    video?.removeEventListener("timeupdate", skipSegment);
    video?.removeEventListener("playing", skipSegment);
    clock?.remove();
    document.getElementById("iptube-feature-toast")?.remove();
    restoreThumbnails();
  }

  return Object.freeze({ start, stop, refresh, getSettings: () => settings });
})();
