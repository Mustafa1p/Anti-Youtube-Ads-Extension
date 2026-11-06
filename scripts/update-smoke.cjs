const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const path = require("node:path");
const fs = require("node:fs");
const assert = require("node:assert/strict");
(async () => {
  fs.mkdirSync("output", { recursive: true });
  const ext =
    process.env.EXTENSION_UNDER_TEST || path.resolve(__dirname, "../extension");
  const context = await chromium.launchPersistentContext(
    fs.mkdtempSync(path.resolve("output/update-smoke-")),
    {
      channel: "chromium",
      headless: true,
      viewport: { width: 460, height: 900 },
      args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`]
    }
  );
  try {
    const worker =
      context.serviceWorkers()[0] ||
      (await context.waitForEvent("serviceworker"));
    const errors = [];
    context.on("weberror", (error) => errors.push(error.error().message));
    await worker.evaluate(() => {
      globalThis.updateFixtureVersion = "2.5.0";
      globalThis.updateFixtureRequests = 0;
      globalThis.fetch = async (url) => {
        if (
          url !==
          "https://api.github.com/repos/Mustafa1p/Anti-Youtube-Ads-Extension/releases/latest"
        )
          throw new Error("Unexpected URL");
        globalThis.updateFixtureRequests++;
        if (globalThis.updateFixtureOffline) throw new Error("offline");
        const tag = `v${globalThis.updateFixtureVersion}`;
        const base =
          "https://github.com/Mustafa1p/Anti-Youtube-Ads-Extension/releases";
        return new Response(
          JSON.stringify({
            tag_name: tag,
            html_url: `${base}/tag/${tag}`,
            assets: [
              {
                name: "iptube-browser-extension.zip",
                state: "uploaded",
                size: 1234,
                browser_download_url: `${base}/download/${tag}/iptube-browser-extension.zip`
              }
            ]
          })
        );
      };
    });
    const page = await context.newPage();
    await page.goto(
      `chrome-extension://${new URL(worker.url()).host}/popup.html`
    );
    await page.getByText("v2.5.0 is available", { exact: true }).waitFor();
    assert.equal(
      await worker.evaluate(() => chrome.action.getBadgeText({})),
      "NEW"
    );
    assert.equal(
      await page.locator("#downloadUpdate").getAttribute("href"),
      "https://github.com/Mustafa1p/Anti-Youtube-Ads-Extension/releases/download/v2.5.0/iptube-browser-extension.zip"
    );
    assert.equal(
      await page.locator("#updateInstructions").getAttribute("open"),
      ""
    );
    assert.equal(
      await worker.evaluate(
        async () =>
          (await chrome.alarms.get("iptube-release-check")).periodInMinutes
      ),
      360
    );
    await page.reload();
    await page.getByText("v2.5.0 is available", { exact: true }).waitFor();
    assert.equal(
      await worker.evaluate(() => globalThis.updateFixtureRequests),
      1,
      "Popup reuses cached check"
    );
    await worker.evaluate(() => {
      globalThis.updateFixtureOffline = true;
    });
    await page.locator("#checkUpdates").click();
    await page
      .getByText(
        "v2.5.0 is available · last check failed; showing saved release",
        { exact: true }
      )
      .waitFor();
    assert.equal(await page.locator("#downloadUpdate").isVisible(), true);
    await worker.evaluate(() => {
      globalThis.updateFixtureOffline = false;
      globalThis.updateFixtureVersion = chrome.runtime.getManifest().version;
    });
    await page.locator("#checkUpdates").click();
    await page.getByText("You're up to date", { exact: false }).waitFor();
    assert.equal(await page.locator("#downloadUpdate").isVisible(), false);
    assert.equal(
      await worker.evaluate(() => chrome.action.getBadgeText({})),
      ""
    );
    await worker.evaluate(() => {
      globalThis.updateFixtureVersion = "2.5.0";
    });
    await page.locator("#checkUpdates").click();
    await page.getByText("v2.5.0 is available", { exact: true }).waitFor();
    await page.screenshot({
      path: "output/github-update-picker.png",
      fullPage: true
    });
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        passed: true,
        browserVersion: context.browser().version(),
        checks:
          "new release, badge, exact download, install guide, alarm, cached reopen, offline, current version"
      })
    );
  } finally {
    await context.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
