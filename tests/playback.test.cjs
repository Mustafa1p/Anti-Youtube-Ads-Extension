const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = (name) =>
  fs.readFileSync(path.join(__dirname, "../extension", name), "utf8");

function pagePatch(mode = "on") {
  class Response {
    constructor(payload, url = "https://www.youtube.com/youtubei/v1/player") {
      this.payload = payload;
      this.url = url;
    }
    async json() {
      return this.payload;
    }
  }
  let notify;
  const context = vm.createContext({
    MutationObserver: class {
      constructor(callback) {
        notify = callback;
      }
      observe() {}
      disconnect() {}
    },
    URL,
    Response,
    fetch() {},
    document: { documentElement: { getAttribute: () => mode } }
  });
  context.window = context;
  const originals = vm.runInContext(
    "[fetch, Function.prototype.toString, JSON.stringify, JSON.parse, Response.prototype.json]",
    context
  );
  vm.runInContext(source("earlyPatch.js"), context);
  return {
    context,
    Response,
    originals,
    run: (code) => vm.runInContext(code, context),
    mode: (next) => {
      mode = next;
      notify();
    }
  };
}
const player = () => ({
  responseContext: {},
  playabilityStatus: { status: "OK" },
  streamingData: { adaptiveFormats: [{ url: "signed-url", bitrate: 123 }] },
  videoDetails: { videoId: "abc" },
  adPlacements: [1],
  playerAds: [2],
  adSlots: [3],
  serviceIntegrityDimensions: { poToken: "original-token" },
  captions: {},
  attestation: { challenge: "original" },
  nested: { adPlacements: ["unrelated"], address: "preserved" }
});

test("player cleanup removes only explicit ad fields and preserves streams, integrity and UI", () => {
  const patch = pagePatch();
  patch.context.input = JSON.stringify(player());
  const result = patch.run("JSON.parse(input)");
  const expected = player();
  for (const key of ["adPlacements", "playerAds", "adSlots"])
    delete expected[key];
  assert.deepEqual(JSON.parse(JSON.stringify(result)), expected);
  patch.context.input = player();
  patch.run("window.ytInitialPlayerResponse = input");
  assert.equal(patch.run("ytInitialPlayerResponse.adPlacements"), undefined);
  const after = patch.run(
    "[fetch, Function.prototype.toString, JSON.stringify, JSON.parse, Response.prototype.json]"
  );
  after.slice(0, 3).forEach((fn, i) => assert.equal(fn, patch.originals[i]));
  patch.mode("off");
  patch
    .run(
      "[fetch, Function.prototype.toString, JSON.stringify, JSON.parse, Response.prototype.json]"
    )
    .forEach((fn, i) => assert.equal(fn, patch.originals[i]));
});

test("blocked, login, bot, age and unavailable states are preserved exactly", () => {
  const { context, run } = pagePatch();
  for (const status of [
    "UNPLAYABLE",
    "ERROR",
    "LOGIN_REQUIRED",
    "AGE_CHECK_REQUIRED",
    "LIVE_STREAM_OFFLINE"
  ]) {
    for (const reason of [
      "Ad blockers violate Terms of Service",
      "Sign in to confirm you are not a bot",
      "Video unavailable"
    ]) {
      const input = {
        ...player(),
        playabilityStatus: { status, reason, errorScreen: { message: reason } },
        adBlockerMessageRenderer: { reason }
      };
      context.input = JSON.stringify(input);
      assert.deepEqual(
        JSON.parse(JSON.stringify(run("JSON.parse(input)"))),
        input
      );
    }
  }
});

test("paused and unknown modes leave player responses unchanged, including future navigation", async () => {
  for (const mode of ["off", null]) {
    const patch = pagePatch(mode);
    patch.context.input = JSON.stringify(player());
    assert.deepEqual(
      JSON.parse(JSON.stringify(patch.run("JSON.parse(input)"))),
      player()
    );
    patch.context.input = player();
    patch.run("ytInitialPlayerResponse = input");
    assert.equal(patch.run("ytInitialPlayerResponse"), patch.context.input);
    const payload = player();
    await new patch.Response(payload).json();
    assert.deepEqual(payload, player());
  }
  const patch = pagePatch();
  patch.mode("off");
  assert.deepEqual(await new patch.Response(player()).json(), player());
});

test("response hook scopes URLs and preserves failures, revivers and malformed JSON", async () => {
  const patch = pagePatch();
  const original = player();
  const result = await new patch.Response(original).json();
  assert.equal(result, original);
  assert.equal(result.playerAds, undefined);
  for (const url of [
    "https://example.com/youtubei/v1/player",
    "https://www.youtube.com/youtubei/v1/browse",
    ""
  ]) {
    assert.deepEqual(await new patch.Response(player(), url).json(), player());
  }
  patch.context.input = JSON.stringify(player());
  assert.ok(patch.run("JSON.parse(input, (key, value) => value).playerAds"));
  assert.throws(() => patch.run("JSON.parse('{')"), { name: "SyntaxError" });
  assert.equal(patch.run("JSON.parse('null')"), null);
  assert.equal(patch.run("JSON.parse('123')"), 123);
  const frozen = Object.freeze(player());
  patch.context.frozen = frozen;
  assert.doesNotThrow(() => patch.run("ytInitialPlayerResponse = frozen"));
  assert.equal(patch.run("ytInitialPlayerResponse"), frozen);
  const broken = new patch.Response(null);
  Object.defineProperty(broken, "payload", {
    get() {
      throw new Error("body already consumed");
    }
  });
  await assert.rejects(broken.json(), /body already consumed/);
});

function blockingService({
  saved = false,
  failRules = false,
  failStorage = false
} = {}) {
  let enabled = saved;
  let rulesEnabled = null;
  const changes = [];
  const context = vm.createContext({
    console,
    chrome: {
      storage: {
        local: {
          get: async () => ({ adBlockingEnabled: enabled }),
          set: async (value) => {
            if (failStorage) throw new Error("disk full");
            enabled = value.adBlockingEnabled;
          }
        }
      },
      declarativeNetRequest: {
        // Set after loading so startup cannot obscure test ordering.
      }
    }
  });
  vm.runInContext(source("adBlockingService.js"), context);
  context.chrome.declarativeNetRequest.updateEnabledRulesets = async (
    value
  ) => {
    if (failRules) throw new Error("rules unavailable");
    rulesEnabled = value.enableRulesetIds.includes("youtube_rules");
    changes.push(rulesEnabled);
  };
  return {
    service: vm.runInContext("AdBlockingService", context),
    state: () => ({ enabled, rulesEnabled, changes })
  };
}

test("pause state survives worker restarts and rapid toggles serialize network and page settings", async () => {
  const { service, state } = blockingService({ saved: false });
  await service.sync();
  assert.equal(state().rulesEnabled, false);
  await Promise.all([service.setEnabled(true), service.setEnabled(false)]);
  assert.deepEqual(state(), {
    enabled: false,
    rulesEnabled: false,
    changes: [false, true, false]
  });
  const restart = blockingService({ saved: state().enabled });
  await restart.service.sync();
  assert.equal(restart.state().rulesEnabled, false);
});

test("failed pause reports failure and storage failure restores the preceding network state", async () => {
  const network = blockingService({ saved: true, failRules: true });
  await assert.rejects(network.service.setEnabled(false), /rules unavailable/);
  assert.equal(network.state().enabled, true);
  const storage = blockingService({ saved: true, failStorage: true });
  await assert.rejects(storage.service.setEnabled(false), /disk full/);
  assert.equal(storage.state().enabled, true);
  assert.equal(storage.state().rulesEnabled, true);
});

test("network blocking stays on YouTube ad endpoints and leaves media and telemetry alone", () => {
  const rules = JSON.parse(source("rules/rules_1.json"));
  for (const rule of rules) {
    assert.deepEqual(rule.condition.initiatorDomains, ["www.youtube.com"]);
    if (rule.action.type !== "block") continue;
    const filter = rule.condition.urlFilter || rule.condition.regexFilter;
    assert.ok(
      !/googlevideo|videoplayback|ctier|_ad_|stats\/|log_event|survey|ptracking/.test(
        filter
      ),
      filter
    );
    assert.ok(
      filter.startsWith("||"),
      "Block endpoints must have anchored hosts"
    );
  }
  assert.ok(rules.some((rule) => rule.action.type === "block"));
  const manifest = JSON.parse(source("manifest.json"));
  assert.ok(!manifest.permissions.includes("browsingData"));
  assert.ok(
    !manifest.content_scripts.some((entry) =>
      entry.js.includes("storageSanitizer.js")
    )
  );
  assert.equal(
    manifest.declarative_net_request.rule_resources[0].enabled,
    false
  );
});

test("DOM ad skipping uses visible native buttons without seeking content or changing player state", () => {
  const script = source("contentScript.js");
  const begin = script.indexOf("function scrubPlayerAds()");
  const end = script.indexOf("function pruneSponsoredRichItems", begin);
  let enabled = true,
    ad = false,
    visible = true,
    disabled = false,
    clicks = 0,
    checks = 0;
  const button = {
    get disabled() {
      return disabled;
    },
    getAttribute: () => null,
    getClientRects: () => (visible ? [1] : []),
    click: () => clicks++
  };
  const context = vm.createContext({
    PlaybackSafety: { isEnabled: () => enabled, check: () => checks++ },
    document: {
      getElementById: () => ({
        classList: { contains: () => ad },
        querySelector: () => button
      })
    }
  });
  vm.runInContext(script.slice(begin, end), context);
  const run = () => vm.runInContext("scrubPlayerAds()", context);
  run();
  assert.equal(clicks, 0);
  ad = true;
  visible = false;
  run();
  assert.equal(clicks, 0);
  visible = true;
  disabled = true;
  run();
  assert.equal(clicks, 0);
  disabled = false;
  run();
  assert.equal(clicks, 1);
  enabled = false;
  run();
  assert.equal(clicks, 1);
  assert.equal(checks, 5);
});

test("page settings wait for storage and discard stale initial reads after a live toggle", async () => {
  let resolveLoad, onChange, attribute;
  const context = vm.createContext({
    chrome: {
      storage: {
        local: {
          get: () =>
            new Promise((resolve) => {
              resolveLoad = resolve;
            })
        },
        onChanged: {
          addListener: (listener) => {
            onChange = listener;
          }
        }
      }
    },
    document: {
      documentElement: {
        setAttribute: (_, value) => {
          attribute = value;
        }
      }
    }
  });
  vm.runInContext(source("playbackSafety.js"), context);
  assert.equal(vm.runInContext("PlaybackSafety.isEnabled()", context), false);
  onChange({ adBlockingEnabled: { newValue: false } }, "local");
  resolveLoad({ adBlockingEnabled: true });
  await new Promise(setImmediate);
  assert.equal(attribute, "off");
  assert.equal(vm.runInContext("PlaybackSafety.isEnabled()", context), false);
  onChange({ adBlockingEnabled: { newValue: true } }, "local");
  assert.equal(attribute, "on");
});
