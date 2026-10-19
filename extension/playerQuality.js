// MAIN world: desktop YouTube's player methods are unavailable in the isolated world.
(() => {
  "use strict";
  let enabled = false;
  let lastSelection = "";
  const ranking = [
    "highres",
    "hd2880",
    "hd2160",
    "hd1440",
    "hd1080",
    "hd720",
    "large",
    "medium",
    "small",
    "tiny"
  ];

  function applyQuality() {
    if (!enabled || document.hidden || location.pathname !== "/watch") return;
    const player = document.getElementById("movie_player");
    if (
      !player ||
      player.classList.contains("ad-showing") ||
      player.classList.contains("ad-interrupting")
    )
      return;
    try {
      const levels = player.getAvailableQualityLevels?.();
      if (!Array.isArray(levels)) return;
      const highest = ranking.find((level) => levels.includes(level));
      if (!highest) return;
      const videoId = new URLSearchParams(location.search).get("v");
      const selection = `${videoId}:${highest}`;
      if (selection === lastSelection) return;
      if (typeof player.setPlaybackQualityRange !== "function") return;
      player.setPlaybackQualityRange(highest, highest);
      player.setPlaybackQuality?.(highest);
      lastSelection = selection;
    } catch {
      // Player methods can disappear while YouTube replaces its player.
    }
  }

  window.addEventListener("message", (event) => {
    if (
      event.source !== window ||
      event.origin !== location.origin ||
      event.data?.source !== "IPTUBE_SETTINGS" ||
      event.data.type !== "QUALITY_PREFERENCE" ||
      typeof event.data.enabled !== "boolean"
    )
      return;
    enabled = event.data.enabled;
    lastSelection = "";
    if (!enabled) {
      try {
        document
          .getElementById("movie_player")
          ?.setPlaybackQualityRange?.("default", "default");
      } catch {}
    }
    applyQuality();
  });
  document.addEventListener("yt-navigate-finish", () => {
    lastSelection = "";
    applyQuality();
  });
  const interval = setInterval(applyQuality, 2000);
  window.addEventListener("pagehide", () => clearInterval(interval), {
    once: true
  });
})();
