const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const read = (name) =>
  fs.readFileSync(path.join(__dirname, "../extension", name), "utf8");

test("theme preferences migrate to Stranger Things and reject invalid persisted values", async () => {
  let saved;
  const context = vm.createContext({
    chrome: {
      storage: { local: { get: async () => ({ iptubeTheme: saved }) } }
    }
  });
  vm.runInContext(read("themeSettings.js"), context);
  const settings = vm.runInContext("ThemeSettings", context);
  assert.equal(await settings.load(), "stranger-things");
  for (const value of [null, {}, "unknown", "__proto__", 7]) {
    saved = value;
    assert.equal(await settings.load(), "stranger-things");
  }
  assert.equal(settings.THEMES.length, 9);
  for (const theme of settings.THEMES) {
    saved = theme.id;
    assert.equal(await settings.load(), theme.id);
    assert.ok(theme.colors.every((color) => /^#[\da-f]{6}$/i.test(color)));
    if (theme.asset)
      assert.ok(
        fs.existsSync(path.join(__dirname, "../extension/themes", theme.asset))
      );
  }
});

test("a live theme switch wins over a stale initial storage read and Original removes palette tokens", async () => {
  let finishRead;
  let onChange;
  const properties = new Map();
  const attrs = new Map();
  const listeners = new Map();
  const context = vm.createContext({
    console,
    chrome: {
      storage: {
        local: {
          get: () =>
            new Promise((resolve) => {
              finishRead = resolve;
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
      readyState: "loading",
      body: {},
      documentElement: {
        style: {
          setProperty: (key, value) => properties.set(key, value),
          removeProperty: (key) => properties.delete(key)
        },
        setAttribute: (key, value) => attrs.set(key, value),
        hasAttribute: (key) => attrs.has(key),
        removeAttribute: (key) => attrs.delete(key)
      },
      querySelector: () => null,
      getElementById: () => null,
      addEventListener: (event, listener) => listeners.set(event, listener),
      dispatchEvent: () => {}
    },
    MutationObserver: class {
      observe() {}
    },
    CustomEvent: class {}
  });
  vm.runInContext(read("themeSettings.js"), context);
  vm.runInContext(read("themeController.js"), context);
  listeners.get("DOMContentLoaded")();
  onChange({ iptubeTheme: { newValue: "xbox" } }, "local");
  finishRead({ iptubeTheme: "netflix" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(attrs.get("data-iptube-theme"), "xbox");
  assert.equal(properties.get("--ipt-accent"), "#8bdf55");
  assert.equal(attrs.has("dark"), true);
  onChange({ iptubeTheme: { newValue: "original" } }, "local");
  assert.equal(attrs.get("data-iptube-theme"), "original");
  assert.equal(properties.size, 0);
  assert.equal(attrs.has("dark"), false);
  onChange({ iptubeTheme: { newValue: "netflix" } }, "sync");
  assert.equal(attrs.get("data-iptube-theme"), "original");
});
