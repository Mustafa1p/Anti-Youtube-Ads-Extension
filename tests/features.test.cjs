const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto, createHash } = require("node:crypto");
const source = (name) =>
  readFileSync(path.join(__dirname, "..", "extension", name), "utf8");

function settingsContext(extra = {}) {
  const context = vm.createContext(extra);
  vm.runInContext(source("featureSettings.js"), context);
  return context;
}

test("feature preferences use typed defaults and allow only supported categories", () => {
  const context = settingsContext();
  const settings = vm.runInContext(
    'FeatureSettings.normalize({ sponsorBlock: "yes", audioOnly: true, sponsorCategories: ["sponsor", "bad", "sponsor", "intro"] })',
    context
  );
  assert.equal(settings.sponsorBlock, false);
  assert.equal(settings.audioOnly, true);
  assert.equal(settings.cinematicEffects, true);
  assert.deepEqual(Array.from(settings.sponsorCategories), [
    "sponsor",
    "intro"
  ]);
});

function sponsorService({ enabled = true, response, status = 200 } = {}) {
  const requests = [];
  let fail = false;
  const context = settingsContext({
    URL,
    crypto: webcrypto,
    TextEncoder,
    AbortSignal,
    chrome: {
      storage: {
        local: {
          get: async () => ({ iptubeFeatures: { sponsorBlock: enabled } })
        }
      }
    },
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (fail) throw new Error("offline");
      return { status, ok: status === 200, json: async () => response || [] };
    }
  });
  vm.runInContext(source("sponsorBlockService.js"), context);
  return {
    service: vm.runInContext("SponsorBlockService", context),
    requests,
    setFail: (value) => {
      fail = value;
    }
  };
}

test("SponsorBlock is opt in and rejects invalid video IDs before networking", async () => {
  const { service, requests } = sponsorService({ enabled: false });
  assert.equal((await service.getSegments("SkcO47UDzzY")).length, 0);
  await assert.rejects(
    service.getSegments("https://example.com"),
    /Invalid video ID/
  );
  assert.equal(requests.length, 0);
});

test("SponsorBlock hashes IDs, validates data, deduplicates requests and caches results", async () => {
  const id = "SkcO47UDzzY";
  const { service, requests } = sponsorService({
    response: [
      {
        videoID: id,
        segments: [
          { category: "sponsor", segment: [5, 10], actionType: "skip" },
          { category: "sponsor", segment: [9, 2] },
          { category: "sponsor", segment: [0, Infinity] },
          { category: "sponsor", segment: [1, 3], actionType: "mute" },
          { category: "intro", segment: [1, 3] }
        ]
      }
    ]
  });
  const results = await Promise.all([
    service.getSegments(id),
    service.getSegments(id)
  ]);
  assert.equal(requests.length, 1);
  assert.equal(results[0].length, 1);
  assert.deepEqual(Array.from(results[0][0].segment), [5, 10]);
  const url = new URL(requests[0].url);
  assert.equal(
    url.pathname,
    `/api/skipSegments/${createHash("sha256").update(id).digest("hex").slice(0, 4)}`
  );
  assert.ok(!url.href.includes(id));
  assert.equal(requests[0].options.credentials, "omit");
  await service.getSegments(id);
  assert.equal(requests.length, 1);
});

test("SponsorBlock handles missing entries and retries after network failures", async () => {
  const missing = sponsorService({ status: 404 });
  assert.equal((await missing.service.getSegments("SkcO47UDzzY")).length, 0);
  const offline = sponsorService();
  offline.setFail(true);
  await assert.rejects(offline.service.getSegments("SkcO47UDzzY"), /offline/);
  offline.setFail(false);
  await offline.service.getSegments("SkcO47UDzzY");
  assert.equal(offline.requests.length, 2);
});

test("highest-quality bridge selects available resolution, avoids repeated forcing, and restores auto", () => {
  let onMessage;
  let tick;
  const calls = [];
  const player = {
    classList: { contains: () => false },
    getAvailableQualityLevels: () => ["medium", "hd1080", "hd2160", "auto"],
    setPlaybackQualityRange: (...args) => calls.push(args),
    setPlaybackQuality() {}
  };
  const window = {
    addEventListener(name, callback) {
      if (name === "message") onMessage = callback;
    }
  };
  const location = {
    origin: "https://www.youtube.com",
    pathname: "/watch",
    search: "?v=SkcO47UDzzY"
  };
  vm.runInNewContext(source("playerQuality.js"), {
    window,
    location,
    URLSearchParams,
    document: {
      hidden: false,
      getElementById: () => player,
      addEventListener() {}
    },
    setInterval(callback) {
      tick = callback;
      return 1;
    },
    clearInterval() {}
  });
  const send = (enabled) =>
    onMessage({
      source: window,
      origin: location.origin,
      data: { source: "IPTUBE_SETTINGS", type: "QUALITY_PREFERENCE", enabled }
    });
  send(true);
  tick();
  assert.deepEqual(calls, [["hd2160", "hd2160"]]);
  send(false);
  assert.deepEqual(calls.at(-1), ["default", "default"]);
});

test("segment skipping merges overlaps, ignores ads, and discards stale navigation responses", async () => {
  const events = {};
  const videoEvents = {};
  const responses = [];
  let isAd = false;
  let tick;
  const location = {
    pathname: "/watch",
    search: "?v=SkcO47UDzzY",
    origin: "https://www.youtube.com"
  };
  const video = {
    currentTime: 12,
    duration: 180,
    paused: false,
    seeking: false,
    addEventListener(name, callback) {
      videoEvents[name] = callback;
    },
    removeEventListener() {}
  };
  const element = () => ({ setAttribute() {}, remove() {}, textContent: "" });
  const context = settingsContext({
    URLSearchParams,
    location,
    console,
    Date,
    window: { postMessage() {} },
    document: {
      documentElement: { classList: { toggle() {} } },
      body: { appendChild() {} },
      createElement: element,
      getElementById: (id) =>
        id === "movie_player" ? { classList: { contains: () => isAd } } : null,
      querySelector: () => video,
      querySelectorAll: () => [],
      addEventListener(name, callback) {
        events[name] = callback;
      },
      removeEventListener() {}
    },
    chrome: {
      runtime: {
        sendMessage(message, callback) {
          responses.push(callback);
        }
      },
      storage: {
        local: {
          get: async () => ({ iptubeFeatures: { sponsorBlock: true } })
        },
        onChanged: { addListener() {}, removeListener() {} }
      }
    },
    setTimeout() {
      return 1;
    },
    clearTimeout() {},
    setInterval(callback) {
      tick = callback;
      return 1;
    },
    clearInterval() {}
  });
  vm.runInContext(source("browserFeatures.js"), context);
  vm.runInContext("BrowserFeatures.start()", context);
  await new Promise((resolve) => setImmediate(resolve));
  responses.at(-1)({
    segments: [{ segment: [10, 20] }, { segment: [18, 30] }]
  });
  assert.equal(video.currentTime, 30);
  video.currentTime = 12;
  isAd = true;
  videoEvents.timeupdate();
  assert.equal(video.currentTime, 12);
  isAd = false;
  const oldResponse = responses.at(-1);
  events["yt-navigate-start"]();
  location.search = "?v=zUYiH1XM1Lc";
  tick();
  oldResponse({ segments: [{ segment: [0, 100] }] });
  videoEvents.timeupdate();
  assert.equal(video.currentTime, 12);
  vm.runInContext("BrowserFeatures.stop()", context);
});
