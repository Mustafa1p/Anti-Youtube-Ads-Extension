/* MAIN world. Preserve identity, attestation, requests and playback errors. */
(() => {
  "use strict";
  const attribute = "data-iptube-ad-cleanup";
  const enabled = () =>
    document.documentElement?.getAttribute(attribute) === "on";
  const object = (value) => value !== null && typeof value === "object";
  let restore;

  // Exact player paths only: ad* also matches adaptiveFormats and real UI.
  function prunePlayer(player) {
    if (!object(player) || Array.isArray(player)) return;
    if (player.playabilityStatus?.status !== "OK") return;
    if (!object(player.streamingData) && !object(player.videoDetails)) return;
    for (const key of ["adPlacements", "playerAds", "adSlots"])
      delete player[key];
  }
  function sanitize(payload) {
    if (!enabled() || !object(payload)) return payload;
    try {
      prunePlayer(payload);
      prunePlayer(payload.playerResponse);
      if (Array.isArray(payload)) {
        for (const part of payload.slice(0, 8))
          prunePlayer(part?.playerResponse);
      }
    } catch {
      // Frozen objects or changed response shapes must not break parsing.
    }
    return payload;
  }

  function install() {
    const originalParse = JSON.parse;
    function parse(...args) {
      const payload = Reflect.apply(originalParse, this, args);
      return typeof args[1] === "function" ? payload : sanitize(payload);
    }
    JSON.parse = parse;
    const originalJson =
      typeof Response === "undefined" ? null : Response.prototype.json;
    function json(...args) {
      let relevant = false;
      try {
        const url = new URL(this.url);
        relevant =
          url.origin === "https://www.youtube.com" &&
          /^\/youtubei\/v\d+\/(player|next)(?:\/|$)/.test(url.pathname);
      } catch {}
      return Reflect.apply(originalJson, this, args).then((payload) =>
        relevant ? sanitize(payload) : payload
      );
    }
    if (originalJson) Response.prototype.json = json;

    const name = "ytInitialPlayerResponse";
    const descriptor = Object.getOwnPropertyDescriptor(window, name);
    let value;
    let get;
    // Preserve pre-existing accessors and non-configurable properties.
    if (
      !descriptor ||
      (descriptor.configurable && "value" in descriptor && descriptor.writable)
    ) {
      value = sanitize(window[name]);
      get = () => value;
      Object.defineProperty(window, name, {
        configurable: true,
        enumerable: descriptor?.enumerable ?? true,
        get,
        set: (next) => {
          value = sanitize(next);
        }
      });
    }
    return () => {
      // Do not overwrite another extension's subsequent patches.
      if (JSON.parse === parse) JSON.parse = originalParse;
      if (originalJson && Response.prototype.json === json)
        Response.prototype.json = originalJson;
      if (get && Object.getOwnPropertyDescriptor(window, name)?.get === get) {
        Object.defineProperty(window, name, {
          configurable: true,
          enumerable: descriptor?.enumerable ?? true,
          writable: true,
          value
        });
      }
    };
  }

  function refresh() {
    if (enabled()) {
      if (!restore) restore = install();
    } else if (restore) {
      restore();
      restore = null;
    }
  }
  let watchingRoot = false;
  const observer = new MutationObserver(() => {
    observeRoot();
    refresh();
  });
  function observeRoot() {
    if (!document.documentElement || watchingRoot) return;
    observer.disconnect();
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [attribute]
    });
    watchingRoot = true;
  }
  if (!document.documentElement)
    observer.observe(document, { childList: true });
  observeRoot();
  refresh();
})();
