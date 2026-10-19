// Shared by the popup and isolated-world theme script.
const VideoSettings = (() => {
  const STORAGE_KEY = "ambilightVideoIds";
  const DEFAULT_IDS = Object.freeze(["zUYiH1XM1Lc"]);
  const VIDEO_ID_PATTERN = /^[\w-]{11}$/;

  function extractVideoId(input) {
    const value = input.trim();
    if (VIDEO_ID_PATTERN.test(value)) return value;
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" && url.protocol !== "http:") return null;
      const host = url.hostname.toLowerCase();
      const segments = url.pathname.split("/").filter(Boolean);
      let id;
      if (host === "youtu.be") {
        id = segments[0];
      } else if (host === "youtube.com" || host.endsWith(".youtube.com")) {
        id = url.searchParams.get("v");
        if (!id && ["embed", "shorts", "live", "v"].includes(segments[0]))
          id = segments[1];
        if (!id && segments[0] === "u") id = segments[2];
      }
      return typeof id === "string" && VIDEO_ID_PATTERN.test(id) ? id : null;
    } catch {
      return null;
    }
  }

  function normalizeIds(value) {
    if (!Array.isArray(value)) return [...DEFAULT_IDS];
    return [
      ...new Set(
        value.filter(
          (id) => typeof id === "string" && VIDEO_ID_PATTERN.test(id)
        )
      )
    ];
  }

  async function load() {
    const result = await chrome.storage.local.get([STORAGE_KEY]);
    const ids = normalizeIds(result[STORAGE_KEY]);
    if (result[STORAGE_KEY] === undefined) await save(ids);
    return ids;
  }

  async function save(ids) {
    await chrome.storage.local.set({ [STORAGE_KEY]: normalizeIds(ids) });
  }

  return Object.freeze({
    STORAGE_KEY,
    DEFAULT_IDS,
    extractVideoId,
    normalizeIds,
    load,
    save
  });
})();
