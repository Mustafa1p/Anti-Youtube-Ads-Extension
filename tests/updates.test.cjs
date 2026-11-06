const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(
  path.join(__dirname, "../extension/updateService.js"),
  "utf8"
);
const repo = "https://github.com/Mustafa1p/Anti-Youtube-Ads-Extension/releases";
function release(version = "2.5.0") {
  return {
    tag_name: `v${version}`,
    html_url: `${repo}/tag/v${version}`,
    assets: [
      {
        name: "iptube-browser-extension.zip",
        state: "uploaded",
        size: 123,
        browser_download_url: `${repo}/download/v${version}/iptube-browser-extension.zip`
      }
    ]
  };
}
function setup() {
  const values = {},
    badges = [],
    requests = [],
    alarms = new Map();
  let response = { ok: true, json: async () => release() };
  let version = "2.4.0";
  const context = vm.createContext({
    Date,
    AbortSignal,
    fetch: async (...args) => {
      requests.push(args);
      if (response instanceof Error) throw response;
      return response;
    },
    chrome: {
      runtime: { getManifest: () => ({ version }) },
      storage: {
        local: {
          get: async () => values,
          set: async (data) => Object.assign(values, data)
        }
      },
      action: {
        setBadgeText: async (data) => badges.push(data.text),
        setBadgeBackgroundColor: async () => {}
      },
      alarms: {
        get: async (name) => alarms.get(name),
        create: async (name, data) => alarms.set(name, data)
      }
    }
  });
  vm.runInContext(source, context);
  return {
    service: vm.runInContext("UpdateService", context),
    values,
    badges,
    requests,
    alarms,
    setResponse: (next) => {
      response = next;
    },
    setVersion: (next) => {
      version = next;
    }
  };
}
test("release versions compare numerically and reject malformed or out-of-range versions", () => {
  const { service } = setup();
  for (const [next, current, newer] of [
    ["2.10.0", "2.9.9", true],
    ["2.4", "2.4.0", false],
    ["2.4.0.1", "2.4.0", true],
    ["1.9", "2.0", false],
    ["99999.0", "2.0", false],
    ["2.5.0-beta", "2.0", false],
    [null, "2.4", false]
  ])
    assert.equal(service.isNewer(next, current), newer);
});
test("only stable releases with the exact repository ZIP are accepted", () => {
  const { service } = setup();
  assert.equal(service.parseRelease(release()).latestVersion, "2.5.0");
  for (const data of [
    { ...release(), prerelease: true },
    { ...release(), draft: true },
    { ...release(), tag_name: "v2.5.0;evil" },
    { ...release(), html_url: "https://evil.example" },
    { ...release(), assets: [] }
  ])
    assert.throws(() => service.parseRelease(data));
  const poisoned = release();
  poisoned.assets[0].browser_download_url =
    "https://evil.example/iptube-browser-extension.zip";
  assert.throws(() => service.parseRelease(poisoned));
});
test("checks deduplicate concurrent requests, cache automatic checks, and preserve a known update offline", async () => {
  const state = setup();
  const [first, second] = await Promise.all([
    state.service.check(),
    state.service.check()
  ]);
  assert.equal(first.available, true);
  assert.equal(second.latestVersion, "2.5.0");
  assert.equal(state.requests.length, 1);
  assert.equal(state.badges.at(-1), "NEW");
  assert.equal(state.requests[0][1].credentials, "omit");
  assert.equal(state.requests[0][1].redirect, "error");
  await state.service.check();
  assert.equal(state.requests.length, 1);
  state.setResponse(new Error("offline"));
  const offline = await state.service.check(true);
  assert.equal(offline.available, true);
  assert.equal(offline.error, true);
  assert.equal(
    offline.downloadUrl,
    `${repo}/download/v2.5.0/iptube-browser-extension.zip`
  );
  state.setVersion("2.5.0");
  await state.service.start();
  assert.equal(state.badges.at(-1), "");
  assert.equal((await state.service.status()).available, false);
  assert.equal(state.alarms.get(state.service.ALARM_NAME).periodInMinutes, 360);
});
test("HTTP failures expose a retry state and cached untrusted links never become update actions", async () => {
  const state = setup();
  state.setResponse({ ok: false, status: 403 });
  const result = await state.service.check(true);
  assert.equal(result.error, true);
  assert.equal(result.available, false);
  state.values.iptubeUpdateState = {
    latestVersion: "99.0",
    releaseUrl: "javascript:alert(1)",
    downloadUrl: "https://evil.example"
  };
  const cached = await state.service.status();
  assert.equal(cached.available, false);
  assert.equal(cached.downloadUrl, undefined);
});
