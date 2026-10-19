// Runs in the service worker. Accepts video IDs, never caller-provided URLs.
const SponsorBlockService = (() => {
  const cache = new Map();
  const inFlight = new Map();
  const CACHE_TTL_MS = 30 * 60 * 1000;

  function normalizeSegments(segments, categories) {
    if (!Array.isArray(segments)) return [];
    return segments
      .filter(
        (item) =>
          item &&
          categories.includes(item.category) &&
          (item.actionType === undefined || item.actionType === "skip") &&
          Array.isArray(item.segment) &&
          item.segment.length === 2 &&
          item.segment.every(Number.isFinite) &&
          item.segment[0] >= 0 &&
          item.segment[1] > item.segment[0]
      )
      .map((item) => ({
        category: item.category,
        segment: item.segment.slice()
      }))
      .sort((a, b) => a.segment[0] - b.segment[0]);
  }

  async function lookup(videoId, categories) {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(videoId)
    );
    const prefix = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0")
    )
      .join("")
      .slice(0, 4);
    const url = new URL(
      `https://sponsorblock.inf.re/api/skipSegments/${prefix}`
    );
    url.searchParams.set("categories", JSON.stringify(categories));
    const response = await fetch(url.href, {
      credentials: "omit",
      signal: AbortSignal.timeout(8000)
    });
    if (response.status === 404) return [];
    if (!response.ok) throw new Error(`SponsorBlock HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error("Invalid SponsorBlock response");
    return normalizeSegments(
      data.find((item) => item?.videoID === videoId)?.segments,
      categories
    );
  }

  async function getSegments(videoId) {
    if (typeof videoId !== "string" || !/^[\w-]{11}$/.test(videoId))
      throw new Error("Invalid video ID");
    const settings = await FeatureSettings.load();
    const categories = settings.sponsorCategories;
    if (!settings.sponsorBlock || !categories.length) return [];
    const key = `${videoId}:${categories.slice().sort().join(",")}`;
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.segments;
    if (inFlight.has(key)) return inFlight.get(key);
    const request = lookup(videoId, categories)
      .then((segments) => {
        if (cache.size >= 100) cache.delete(cache.keys().next().value);
        cache.set(key, { segments, expires: Date.now() + CACHE_TTL_MS });
        return segments;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, request);
    return request;
  }

  return Object.freeze({ getSegments, normalizeSegments });
})();
