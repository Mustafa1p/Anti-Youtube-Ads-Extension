const FeatureSettings = (() => {
  const STORAGE_KEY = "iptubeFeatures";
  const CATEGORIES = Object.freeze([
    "sponsor",
    "intro",
    "outro",
    "selfpromo",
    "interaction",
    "music_offtopic",
    "preview"
  ]);
  const DEFAULTS = Object.freeze({
    sponsorBlock: false,
    sponsorCategories: Object.freeze(["sponsor"]),
    highestQuality: false,
    audioOnly: false,
    upgradeThumbnails: false,
    showClock: false,
    hideLogo: false,
    reduceMotion: false,
    cinematicEffects: true
  });

  function normalize(value) {
    const input = value && typeof value === "object" ? value : {};
    const result = {};
    for (const [key, fallback] of Object.entries(DEFAULTS)) {
      result[key] =
        key === "sponsorCategories"
          ? [
              ...new Set(
                (Array.isArray(input[key]) ? input[key] : fallback).filter(
                  (item) => CATEGORIES.includes(item)
                )
              )
            ]
          : typeof input[key] === "boolean"
            ? input[key]
            : fallback;
    }
    return result;
  }

  async function load() {
    const result = await chrome.storage.local.get([STORAGE_KEY]);
    return normalize(result[STORAGE_KEY]);
  }

  return Object.freeze({ STORAGE_KEY, CATEGORIES, DEFAULTS, normalize, load });
})();
