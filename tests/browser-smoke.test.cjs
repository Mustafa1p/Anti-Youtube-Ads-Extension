const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");

const script = path.resolve(__dirname, "../scripts/browser-smoke.cjs");
const source = fs.readFileSync(script, "utf8");

// Exercise the complete script with browser responses, without requiring Chromium.
async function runSmoke(workerError, executablePath) {
  const logs = [];
  const failures = [];
  const processState = {
    env: { PLAYWRIGHT_CHROMIUM_EXECUTABLE: executablePath }
  };
  let sandbox;
  const inBrowserRealm = (value) =>
    value === undefined
      ? undefined
      : vm.runInContext(`(${JSON.stringify(value)})`, sandbox);
  let closed = false;
  let checked = true;
  const workerResults = [
    undefined,
    [],
    ["youtube_rules"],
    [],
    {
      adBlockingEnabled: false
    }
  ];
  const pageResults = [undefined, "UNPLAYABLE", [1], undefined];
  const locator = {
    waitFor: async () => {},
    isChecked: async () => checked,
    uncheck: async () => {
      checked = false;
    },
    check: async () => {
      checked = true;
    },
    click: async () => {}
  };
  const page = {
    goto: async () => {},
    reload: async () => {},
    waitForFunction: async () => {},
    evaluate: async () => inBrowserRealm(pageResults.shift()),
    locator: () => locator,
    screenshot: async () => {}
  };
  const worker = {
    url: () => "chrome-extension://test/background.js",
    on: (event, callback) => {
      assert.equal(event, "console");
      if (workerError)
        callback({ type: () => "error", text: () => workerError });
    },
    evaluate: async () => inBrowserRealm(workerResults.shift())
  };
  const context = {
    serviceWorkers: () => [worker],
    route: async () => {},
    newPage: async () => page,
    browser: () => ({ version: () => "test-browser" }),
    close: async () => {
      closed = true;
    }
  };
  const mockRequire = (name) => {
    if (name === "playwright")
      return {
        chromium: {
          launchPersistentContext: async (_, options) => {
            assert.equal(
              options.channel,
              executablePath ? undefined : "chromium"
            );
            assert.equal(options.executablePath, executablePath);
            return context;
          }
        }
      };
    if (name === "node:fs")
      return {
        mkdirSync: () => {},
        mkdtempSync: () => "test-profile"
      };
    return require(name);
  };
  mockRequire.resolve = (name) => name;
  sandbox = vm.createContext({
    require: mockRequire,
    __dirname: path.dirname(script),
    process: processState,
    URL,
    console: {
      log: (value) => logs.push(JSON.parse(value)),
      error: (error) => failures.push(error)
    }
  });
  await vm.runInContext(source, sandbox);
  return { logs, failures, exitCode: processState.exitCode, closed };
}

test("browser smoke reports success and closes the browser with no worker errors", async () => {
  const result = await runSmoke();
  assert.equal(result.exitCode, undefined);
  assert.equal(result.logs[0].passed, true);
  assert.deepEqual(result.logs[0].workerErrors, []);
  assert.equal(result.failures.length, 0);
  assert.equal(result.closed, true);
});

test("browser smoke fails and closes the browser when a worker logs an error", async () => {
  const result = await runSmoke("Injected service worker failure");
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.logs, []);
  assert.equal(result.failures[0].code, "ERR_ASSERTION");
  assert.match(result.failures[0].message, /Service worker console errors/);
  assert.deepEqual(Array.from(result.failures[0].actual), [
    "Injected service worker failure"
  ]);
  assert.equal(result.closed, true);
});

test("browser smoke respects an explicit Chromium executable without forcing a channel", async () => {
  const result = await runSmoke(undefined, "/external/chromium");
  assert.equal(result.exitCode, undefined);
  assert.equal(result.logs[0].passed, true);
  assert.equal(result.closed, true);
});

test("missing Playwright exits unsuccessfully with installation and override guidance", () => {
  const result = spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: {
      ...process.env,
      PLAYWRIGHT_MODULE: `iptube-missing-playwright-${randomUUID()}`
    }
  });
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /npm install --no-save playwright/);
  assert.match(result.stderr, /npx playwright install chromium/);
  assert.match(result.stderr, /npm run test:browser/);
  assert.match(result.stderr, /PLAYWRIGHT_MODULE/);
  assert.doesNotMatch(result.stdout, /"passed":true/);
});
