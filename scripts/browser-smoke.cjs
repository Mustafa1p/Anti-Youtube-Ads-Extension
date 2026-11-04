// Optional integration check. Requires Playwright and its Chromium browser.
const path = require("node:path");
const fs = require("node:fs");
const assert = require("node:assert/strict");
(async () => {
  const playwrightModule = process.env.PLAYWRIGHT_MODULE || "playwright";
  let playwrightPath;
  try {
    playwrightPath = require.resolve(playwrightModule);
  } catch (error) {
    if (error.code !== "MODULE_NOT_FOUND") throw error;
    throw new Error(
      `Cannot load Playwright (${playwrightModule}). ` +
        "Install it with: npm install --no-save playwright\n" +
        "Then install Chromium with: npx playwright install chromium\n" +
        "Run again with: npm run test:browser\n" +
        "If using PLAYWRIGHT_MODULE, check that it points to an installed Playwright module.",
      { cause: error }
    );
  }
  const { chromium } = require(playwrightPath);
  const ext =
    process.env.EXTENSION_UNDER_TEST || path.resolve(__dirname, "../extension");
  fs.mkdirSync(path.resolve("output"), { recursive: true });
  const context = await chromium.launchPersistentContext(
    fs.mkdtempSync(path.resolve("output/iptube-smoke-")),
    {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
      channel: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
        ? undefined
        : "chromium",
      headless: true,
      args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`]
    }
  );
  try {
    const worker =
      context.serviceWorkers()[0] ||
      (await context.waitForEvent("serviceworker"));
    const id = new URL(worker.url()).host;
    const errors = [];
    worker.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await context.route("https://www.youtube.com/**", async (route) => {
      if (route.request().isNavigationRequest())
        return route.fulfill({
          contentType: "text/html",
          body: '<!doctype html><html><head></head><body><div id="movie_player"><video class="html5-main-video"></video></div><div id="fixture"></div></body></html>'
        });
      await route.abort();
    });
    await worker.evaluate(() =>
      chrome.storage.local.set({ adBlockingEnabled: true })
    );
    const page = await context.newPage();
    await page.goto("https://www.youtube.com/watch?v=SkcO47UDzzY");
    await page.waitForFunction(
      () =>
        document.documentElement.getAttribute("data-iptube-ad-cleanup") === "on"
    );
    assert.equal(
      await page.evaluate(
        () =>
          JSON.parse(
            '{"playabilityStatus":{"status":"OK"},"streamingData":{},"adPlacements":[1]}'
          ).adPlacements
      ),
      undefined
    );
    assert.equal(
      await page.evaluate(
        () =>
          JSON.parse(
            '{"playabilityStatus":{"status":"UNPLAYABLE","reason":"Ad blockers violate Terms of Service"}}'
          ).playabilityStatus.status
      ),
      "UNPLAYABLE"
    );
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await popup.locator("#adBlockingEnabled:not([disabled])").waitFor();
    assert.equal(await popup.locator("#adBlockingEnabled").isChecked(), true);
    await popup.locator("#adBlockingEnabled").uncheck();
    await popup.waitForFunction(
      () => document.getElementById("adBlockingEnabled").disabled === false
    );
    await page.waitForFunction(
      () =>
        document.documentElement.getAttribute("data-iptube-ad-cleanup") ===
        "off"
    );
    assert.deepEqual(
      await worker.evaluate(() =>
        chrome.declarativeNetRequest.getEnabledRulesets()
      ),
      []
    );
    await page.reload();
    await page.waitForFunction(
      () =>
        document.documentElement.getAttribute("data-iptube-ad-cleanup") ===
        "off"
    );
    assert.deepEqual(
      await page.evaluate(
        () =>
          JSON.parse(
            '{"playabilityStatus":{"status":"OK"},"streamingData":{},"adPlacements":[1]}'
          ).adPlacements
      ),
      [1]
    );
    await popup.reload();
    await popup.locator("#adBlockingEnabled:not([disabled])").waitFor();
    assert.equal(await popup.locator("#adBlockingEnabled").isChecked(), false);
    await popup.locator("#adBlockingEnabled").check();
    await popup.waitForFunction(
      () => document.getElementById("adBlockingEnabled").disabled === false
    );
    await page.waitForFunction(
      () =>
        document.documentElement.getAttribute("data-iptube-ad-cleanup") === "on"
    );
    assert.deepEqual(
      await worker.evaluate(() =>
        chrome.declarativeNetRequest.getEnabledRulesets()
      ),
      ["youtube_rules"]
    );
    await page.evaluate(() =>
      document
        .getElementById("fixture")
        .appendChild(
          document.createElement("ytd-enforcement-message-view-model")
        )
    );
    await page.locator("#iptube-playback-recovery button").waitFor();
    await page.screenshot({ path: "output/playback-recovery.png" });
    await page.locator("#iptube-playback-recovery button").click();
    await page.waitForFunction(
      () =>
        document.documentElement.getAttribute("data-iptube-ad-cleanup") ===
        "off"
    );
    assert.deepEqual(
      await worker.evaluate(() =>
        chrome.declarativeNetRequest.getEnabledRulesets()
      ),
      []
    );
    const stored = await worker.evaluate(() =>
      chrome.storage.local.get("adBlockingEnabled")
    );
    assert.equal(stored.adBlockingEnabled, false);
    assert.deepEqual(errors, [], "Service worker console errors occurred");
    console.log(
      JSON.stringify({
        passed: true,
        browserVersion: context.browser().version(),
        checks: [
          "real MV3 worker loaded",
          "scoped pruning",
          "error preservation",
          "popup pause",
          "DNR disabled",
          "page reload paused",
          "popup persisted",
          "resume DNR",
          "enforcement recovery button"
        ],
        workerErrors: errors
      })
    );
  } finally {
    await context.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
