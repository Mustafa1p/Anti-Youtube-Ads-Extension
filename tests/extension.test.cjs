const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const extension = path.join(__dirname, "..", "extension");
const source = (name) => readFileSync(path.join(extension, name), "utf8");

function createStorage(initial = {}) {
  const values = { ...initial };
  return {
    values,
    local: {
      async get(keys) {
        await new Promise((resolve) => setImmediate(resolve));
        return Object.fromEntries(keys.map((key) => [key, values[key]]));
      },
      async set(update) {
        await new Promise((resolve) => setImmediate(resolve));
        Object.assign(values, update);
      }
    }
  };
}

function loadSettings(initial) {
  const storage = createStorage(initial);
  const context = vm.createContext({ URL, chrome: { storage } });
  vm.runInContext(source("videoSettings.js"), context);
  return { settings: vm.runInContext("VideoSettings", context), storage };
}

test("content scripts load in manifest order with a shared scope", () => {
  const listeners = {};
  const storage = createStorage();
  storage.onChanged = { addListener() {} };
  const context = vm.createContext({
    URL,
    URLSearchParams,
    console,
    chrome: { storage },
    document: {
      readyState: "loading",
      addEventListener(name, listener) {
        listeners[name] = listener;
      },
      getElementById() {
        return null;
      },
      querySelector() {
        return null;
      }
    },
    window: { addEventListener() {}, location: { pathname: "/", search: "" } },
    setInterval() {
      return 1;
    },
    clearInterval() {},
    setTimeout() {
      return 1;
    }
  });
  const manifest = JSON.parse(source("manifest.json"));
  for (const name of manifest.content_scripts.at(-1).js) {
    vm.runInContext(source(name), context, { filename: name });
  }
  assert.equal(vm.runInContext("clampSuperVolume(700)", context), 500);
  assert.equal(
    vm.runInContext("parseDurationSeconds('1:02:03')", context),
    3723
  );
  assert.equal(vm.runInContext("isWatchPage()", context), false);
  vm.runInContext("curateWatchSidebar()", context);
});

test("video IDs are extracted from supported YouTube URLs only", () => {
  const { settings } = loadSettings();
  const id = "zUYiH1XM1Lc";
  for (const input of [
    id,
    `https://youtu.be/${id}?t=12`,
    `https://www.youtube.com/watch?v=${id}`,
    `https://m.youtube.com/shorts/${id}`,
    `https://youtube.com/embed/${id}`,
    `https://youtube.com/live/${id}`,
    `https://youtube.com/u/1/${id}`
  ]) {
    assert.equal(settings.extractVideoId(input), id, input);
  }
  for (const input of [
    "",
    "invalid",
    `https://youtube.com.evil.test/watch?v=${id}`,
    `https://example.com/${id}`,
    `ftp://youtube.com/watch?v=${id}`
  ]) {
    assert.equal(settings.extractVideoId(input), null, input);
  }
});

test("video settings preserve empty lists, filter corrupt entries, and initialize defaults", async () => {
  const { settings, storage } = loadSettings();
  assert.deepEqual(Array.from(await settings.load()), ["zUYiH1XM1Lc"]);
  await settings.save([]);
  assert.deepEqual(Array.from(await settings.load()), []);
  storage.values.ambilightVideoIds = [
    null,
    "bad",
    "zUYiH1XM1Lc",
    "zUYiH1XM1Lc",
    123
  ];
  assert.deepEqual(Array.from(await settings.load()), ["zUYiH1XM1Lc"]);
  storage.values.ambilightVideoIds = "corrupt";
  assert.deepEqual(Array.from(await settings.load()), ["zUYiH1XM1Lc"]);
});

function loadBackground(initial) {
  const storage = createStorage(initial);
  let onMessage;
  let onRule;
  const context = vm.createContext({
    console,
    chrome: {
      storage,
      runtime: {
        onInstalled: { addListener() {} },
        onMessage: {
          addListener(listener) {
            onMessage = listener;
          }
        }
      },
      declarativeNetRequest: {
        onRuleMatchedDebug: {
          addListener(listener) {
            onRule = listener;
          }
        }
      }
    }
  });
  context.importScripts = (...files) =>
    files.forEach((name) => vm.runInContext(source(name), context));
  vm.runInContext(source("background.js"), context);
  function send(type) {
    return new Promise((resolve) =>
      assert.equal(onMessage({ type }, {}, resolve), true)
    );
  }
  return { send, storage, onRule };
}

test("concurrent requests do not lose blocked-count increments", async () => {
  const { send, onRule } = loadBackground();
  await Promise.all([
    ...Array.from({ length: 40 }, () => send("INCREMENT_BLOCK_COUNT")),
    ...Array.from({ length: 10 }, () => onRule({ rule: { id: 1 } }))
  ]);
  assert.equal((await send("GET_BLOCK_STATS")).blockedRequestCount, 50);
});

test("counter resets and reads respect message ordering", async () => {
  const { send } = loadBackground({ blockedRequestCount: 10 });
  const before = send("INCREMENT_BLOCK_COUNT");
  const reset = send("RESET_BLOCK_STATS");
  const after = send("INCREMENT_BLOCK_COUNT");
  assert.equal((await before).blockedRequestCount, 11);
  assert.equal((await reset).ok, true);
  assert.equal((await after).blockedRequestCount, 1);
  assert.equal((await send("GET_BLOCK_STATS")).blockedRequestCount, 1);
});

test("invalid stored counts recover and counters stay within safe integer range", async () => {
  for (const value of [-1, "garbage", Infinity, 0.5]) {
    const { send } = loadBackground({ blockedRequestCount: value });
    assert.equal((await send("INCREMENT_BLOCK_COUNT")).blockedRequestCount, 1);
  }
  const { send } = loadBackground({
    blockedRequestCount: Number.MAX_SAFE_INTEGER
  });
  assert.equal(
    (await send("INCREMENT_BLOCK_COUNT")).blockedRequestCount,
    Number.MAX_SAFE_INTEGER
  );
});

test("earlyPatch scrubs ad keys and Shorts reel ad markers from JSON responses", () => {
  function MockResponse(body, init) {
    this._body = typeof body === "string" ? body : "";
    this.status = init && init.status != null ? init.status : 200;
    this.ok = this.status >= 200 && this.status < 300;
    this.headers = { get: () => null };
  }
  MockResponse.prototype.json = async function () {
    return {};
  };
  MockResponse.prototype.text = async function () {
    return this._body;
  };

  const ctx = vm.createContext({
    console,
    URL,
    btoa: globalThis.btoa,
    atob: globalThis.atob,
    document: { readyState: "complete", addEventListener() {}, cookie: "" },
    navigator: {},
    postMessage() {},
    fetch: async () => new MockResponse("{}", { status: 200 }),
    Response: MockResponse,
    Request: class {
      constructor(url, init = {}) {
        this.url = typeof url === "string" ? url : (url && url.url) || "";
        this.headers = (init && init.headers) || {};
        for (const k of [
          "redirect",
          "referrer",
          "referrerPolicy",
          "integrity",
          "keepalive",
          "signal"
        ]) {
          this[k] = init && init[k];
        }
      }
    },
    Headers: class {
      constructor(init = {}) {
        this._d = Array.isArray(init)
          ? Object.fromEntries(init)
          : { ...init };
      }
      forEach(cb) {
        Object.entries(this._d).forEach(([k, v]) => cb(v, k));
      }
    },
    XMLHttpRequest: class {
      open() {}
      addEventListener() {}
    },
    setTimeout: () => 1,
    clearTimeout() {},
    setInterval: () => 1,
    clearInterval() {}
  });
  ctx.window = ctx;

  vm.runInContext(source("earlyPatch.js"), ctx);

  // adPlacements and playerAds stripped; non-ad keys preserved
  const r1 = vm.runInContext(
    `JSON.parse('{"responseContext":{},"adPlacements":[1],"playerAds":{"x":1},"contents":{"y":2}}')`,
    ctx
  );
  assert.ok(!("adPlacements" in r1), "adPlacements must be stripped");
  assert.ok(!("playerAds" in r1), "playerAds must be stripped");
  assert.ok("contents" in r1, "non-ad key must be preserved");

  // adClientParams in Shorts reel entries stripped (matches Brave json-prune-fetch-response rule)
  const r2 = vm.runInContext(
    `JSON.parse('{"responseContext":{},"entries":[{"command":{"reelWatchEndpoint":{"adClientParams":{"isAd":true},"videoId":"testId"}}}]}')`,
    ctx
  );
  assert.ok(
    !("adClientParams" in r2.entries[0].command.reelWatchEndpoint),
    "adClientParams must be stripped from Shorts reel entries"
  );
  assert.equal(
    r2.entries[0].command.reelWatchEndpoint.videoId,
    "testId",
    "non-ad reel keys preserved"
  );

  // Enforcement renderer stripped
  const r3 = vm.runInContext(
    `JSON.parse('{"responseContext":{},"adBlockerMessageRenderer":{"text":"Disable your ad blocker"}}')`,
    ctx
  );
  assert.ok(
    !("adBlockerMessageRenderer" in r3),
    "enforcement renderer must be stripped"
  );

  // Blocked playabilityStatus neutralized to OK
  const r4 = vm.runInContext(
    `JSON.parse('{"responseContext":{},"playabilityStatus":{"status":"UNPLAYABLE","reason":"Ad blockers violate Terms of Service"}}')`,
    ctx
  );
  assert.equal(
    r4.playabilityStatus.status,
    "OK",
    "enforcement playabilityStatus must be neutralized"
  );

  // Non-YouTube analytics JSON passes through unchanged
  const r5 = vm.runInContext(
    `JSON.parse('{"event":"pageview","timestamp":123}')`,
    ctx
  );
  assert.equal(r5.event, "pageview");
  assert.equal(r5.timestamp, 123);

  // ytInitialPlayerResponse global sanitized on assignment (matches Brave set scriptlets)
  vm.runInContext(
    `window.ytInitialPlayerResponse = { responseContext: {}, playabilityStatus: { status: "OK" }, adPlacements: [1, 2] }`,
    ctx
  );
  const ipr = vm.runInContext("window.ytInitialPlayerResponse", ctx);
  assert.ok(
    !("adPlacements" in ipr),
    "adPlacements must be stripped from ytInitialPlayerResponse"
  );
  assert.equal(ipr.playabilityStatus.status, "OK", "valid playabilityStatus preserved");

  // Patched functions look native — YouTube's primary detection check
  const fetchStr = vm.runInContext("Function.prototype.toString.call(window.fetch)", ctx);
  assert.ok(
    /\[native code\]/.test(fetchStr),
    "window.fetch must appear native after patching"
  );
  const jsonParseStr = vm.runInContext("Function.prototype.toString.call(JSON.parse)", ctx);
  assert.ok(
    /\[native code\]/.test(jsonParseStr),
    "JSON.parse must appear native after patching"
  );
});

test("network rules cover Brave-equivalent YouTube ad patterns", () => {
  const rules = JSON.parse(source("rules/rules_1.json"));

  // All IDs unique, all rules structurally valid
  const ids = rules.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, "rule IDs must be unique");
  rules.forEach((r) => {
    assert.ok(r.action && r.condition, `rule ${r.id} requires action and condition`);
    if (r.priority !== undefined) {
      assert.ok(
        Number.isInteger(r.priority) && r.priority > 0,
        `rule ${r.id} priority invalid`
      );
    }
  });

  // Allow rules must outprioritize block rules
  const allowRules = rules.filter((r) => r.action.type === "allow");
  assert.ok(allowRules.length > 0, "allow rules must exist");
  allowRules.forEach((r) =>
    assert.ok(
      r.priority > 1,
      `allow rule ${r.id} must have priority > 1 to outrank block rules`
    )
  );

  // TVHTML5 ad initplayback rule (matches Brave: ||googlevideo.com/initplayback?source=youtube&*c=TVHTML5&*oad=)
  const tvRule = rules.find(
    (r) =>
      r.action.type === "block" && r.condition.regexFilter?.includes("TVHTML5")
  );
  assert.ok(tvRule, "TVHTML5 initplayback block rule must exist");
  const tvRe = new RegExp(tvRule.condition.regexFilter);
  assert.ok(
    tvRe.test(
      "https://r1---sn-abc.googlevideo.com/initplayback?source=youtube&c=TVHTML5&oad=1"
    ),
    "TVHTML5 rule must match TVHTML5 ad init URL"
  );
  assert.ok(
    !tvRe.test(
      "https://r1---sn-abc.googlevideo.com/initplayback?source=youtube&c=WEB&oad=1"
    ),
    "TVHTML5 rule must not match non-TVHTML5 init"
  );

  // _ad_ media rule (matches Brave: *_ad_$media,domain=youtube.com,3p)
  const adMediaRule = rules.find(
    (r) =>
      r.action.type === "block" &&
      r.condition.regexFilter?.includes("_ad_") &&
      r.condition.resourceTypes?.includes("media")
  );
  assert.ok(adMediaRule, "_ad_ media blocking rule must exist");
  const adRe = new RegExp(adMediaRule.condition.regexFilter);
  assert.ok(
    adRe.test(
      "https://r5.googlevideo.com/videoplayback?id=xyz_ad_1234&other=params"
    ),
    "_ad_ rule must match ad media URL"
  );
  assert.ok(
    !adRe.test(
      "https://r5.googlevideo.com/videoplayback?id=normalvideo&other=params"
    ),
    "_ad_ rule must not match normal media URL"
  );
});
