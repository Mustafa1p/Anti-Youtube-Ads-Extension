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
