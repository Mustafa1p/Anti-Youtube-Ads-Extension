// Optional runtime verification: npm install --no-save playwright && npx playwright install chromium
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

(async () => {
  const extension =
    process.env.EXTENSION_UNDER_TEST || path.resolve(__dirname, "../extension");
  fs.mkdirSync(path.resolve("output"), { recursive: true });
  const context = await chromium.launchPersistentContext(
    fs.mkdtempSync(path.resolve("output/theme-smoke-")),
    {
      channel: "chromium",
      headless: true,
      viewport: { width: 1280, height: 900 },
      args: [
        `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`
      ]
    }
  );
  try {
    const worker =
      context.serviceWorkers()[0] ||
      (await context.waitForEvent("serviceworker"));
    const id = new URL(worker.url()).host;
    const errors = [];
    context.on("weberror", (error) => errors.push(error.error().message));
    const fixture = `<!doctype html><html><head><style>
      body{margin:0;background:rgb(241,242,243);color:#111;font:14px Arial}
      ytd-app{display:block;min-height:100vh}#masthead-container{position:relative;padding:8px;background:#fff}
      ytd-masthead{display:flex;gap:20px;align-items:center}ytd-topbar-logo-renderer{display:block}
      #logo{display:block;color:#111}main{padding:32px}#movie_player{width:760px;height:280px;background:#101010;position:relative}
      .ytp-play-progress{position:absolute;bottom:0;width:55%;height:4px;background:rgb(255,0,0)}
      yt-page-navigation-progress{display:block}#progress{height:2px;background:rgb(255,0,0)}
      .ytp-spinner-left{border:3px solid red}button{padding:12px 24px;border:1px solid #888;background:#ddd;color:#111}
      #chips-wrapper{padding:12px}yt-chip-cloud-chip-renderer{display:inline-block;padding:10px;margin-right:8px}
      #description{margin-top:16px;padding:20px}ytd-searchbox-form{padding:8px}
    </style></head><body><ytd-app>
      <div id="masthead-container"><ytd-masthead><ytd-topbar-logo-renderer><a id="logo" href="/">YouTube</a><span id="country-code">US</span></ytd-topbar-logo-renderer><ytd-searchbox-form><input id="search" placeholder="Search YouTube"/><button id="search-icon-legacy">Search</button></ytd-searchbox-form></ytd-masthead></div>
      <yt-page-navigation-progress><div id="progress"></div></yt-page-navigation-progress>
      <div id="chips-wrapper"><yt-chip-cloud-chip-renderer selected>All</yt-chip-cloud-chip-renderer><yt-chip-cloud-chip-renderer>Music</yt-chip-cloud-chip-renderer><yt-chip-cloud-chip-renderer>Gaming</yt-chip-cloud-chip-renderer></div>
      <main><h1 class="ytd-watch-metadata">A different world. The same videos.</h1><div id="movie_player"><video class="html5-main-video"></video><div class="ytp-play-progress"></div></div>
      <p><button class="yt-spec-button-shape-next--filled">Subscribe</button> <button class="yt-spec-button-shape-next--tonal">Share</button></p>
      <button class="ytSpecButtonShapeNextHost ytSpecButtonShapeNextFilled">Subscribe (current)</button>
      <div class="ytChipShapeChip ytChipShapeActive">All (current)</div>
      <input class="ytSearchboxComponentInput" placeholder="Search (current)" />
      <div id="description" class="ytd-watch-metadata">Your videos, with a cinematic atmosphere.</div><div class="ytp-spinner-left"></div></main>
    </ytd-app></body></html>`;
    await context.route("https://www.youtube.com/**", (route) =>
      route.request().isNavigationRequest()
        ? route.fulfill({ contentType: "text/html", body: fixture })
        : route.abort()
    );
    const page = await context.newPage();
    await page.goto("https://www.youtube.com/watch?v=abcdefghijk");
    await page.waitForFunction(
      () => document.documentElement.dataset.iptubeTheme === "stranger-things"
    );
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await popup.locator(".theme-card:not([disabled])").first().waitFor();
    assert.equal(await popup.locator(".theme-card").count(), 9);
    assert.equal(
      await popup.evaluate(() =>
        [...document.querySelectorAll(".theme-art img")].every(
          (img) => img.complete && img.naturalWidth > 0
        )
      ),
      true,
      "All bundled logos decode"
    );
    const themes = await popup.evaluate(() =>
      ThemeSettings.THEMES.map((theme) => ({
        id: theme.id,
        accent: theme.colors[3],
        radius: theme.radius
      }))
    );
    for (const theme of themes) {
      await popup.locator(`[data-theme="${theme.id}"]`).click();
      await popup.waitForFunction(
        (id) =>
          document
            .querySelector(`[data-theme="${id}"]`)
            .getAttribute("aria-pressed") === "true",
        theme.id
      );
      await page.waitForFunction(
        (id) => document.documentElement.dataset.iptubeTheme === id,
        theme.id
      );
      const computed = await page.evaluate(() => ({
        bg: getComputedStyle(document.body).backgroundColor,
        progress: getComputedStyle(document.querySelector(".ytp-play-progress"))
          .backgroundColor,
        navProgress: getComputedStyle(document.querySelector("#progress"))
          .backgroundColor,
        button: getComputedStyle(
          document.querySelector(".yt-spec-button-shape-next--filled")
        ).backgroundColor,
        radius: getComputedStyle(
          document.querySelector(".yt-spec-button-shape-next--filled")
        ).borderRadius,
        nativeLogo: getComputedStyle(document.querySelector("#logo")).display,
        brandCount: document.querySelectorAll("#iptube-theme-logo").length,
        imageLoaded: [
          ...document.querySelectorAll("#iptube-theme-logo img")
        ].every((img) => img.complete && img.naturalWidth > 0)
      }));
      if (theme.id === "original") {
        assert.equal(computed.bg, "rgb(241, 242, 243)");
        assert.equal(computed.progress, "rgb(255, 0, 0)");
        assert.equal(computed.nativeLogo, "block");
        assert.equal(computed.brandCount, 0);
      } else {
        const rgb = theme.accent
          .slice(1)
          .match(/../g)
          .map((part) => parseInt(part, 16));
        const color = `rgb(${rgb.join(", ")})`;
        assert.equal(computed.progress, color, `${theme.id} video progress`);
        assert.equal(computed.navProgress, color, `${theme.id} loading line`);
        assert.equal(computed.button, color, `${theme.id} button`);
        assert.equal(computed.radius, theme.radius);
        const modern = await page.evaluate(() => ({
          button: getComputedStyle(
            document.querySelector(".ytSpecButtonShapeNextFilled")
          ).backgroundColor,
          chip: getComputedStyle(document.querySelector(".ytChipShapeActive"))
            .backgroundColor,
          dark: document.documentElement.hasAttribute("dark")
        }));
        assert.equal(modern.button, color, `${theme.id} current button`);
        assert.equal(modern.chip, color, `${theme.id} current chip`);
        assert.equal(modern.dark, true);
        assert.equal(computed.nativeLogo, "none");
        assert.equal(computed.brandCount, 1);
        await page.waitForFunction(() =>
          [...document.querySelectorAll("#iptube-theme-logo img")].every(
            (img) => img.complete && img.naturalWidth > 0
          )
        );
      }
      await page.screenshot({ path: `output/theme-${theme.id}.png` });
    }
    // Reload both surfaces: persisted selection and complete native restoration.
    await popup.reload();
    await popup
      .locator('[data-theme="netflix"][aria-pressed="true"]')
      .waitFor();
    await page.reload();
    await page.waitForFunction(
      () => document.documentElement.dataset.iptubeTheme === "netflix"
    );
    // YouTube can replace its entire masthead without a full document navigation.
    await page.evaluate(() => {
      const old = document.querySelector("ytd-topbar-logo-renderer");
      const replacement = document.createElement("ytd-topbar-logo-renderer");
      replacement.innerHTML = '<a id="logo" href="/">YouTube</a>';
      old.replaceWith(replacement);
      document.dispatchEvent(new Event("yt-navigate-finish"));
    });
    await page.locator('#iptube-theme-logo[data-theme="netflix"]').waitFor();
    // A second open tab receives changes too; native logo survives multiple cycles.
    const second = await context.newPage();
    await second.goto("https://www.youtube.com/");
    await second.waitForFunction(
      () => document.documentElement.dataset.iptubeTheme === "netflix"
    );
    await popup.locator('[data-theme="original"]').focus();
    await popup.keyboard.press("Enter");
    for (const tab of [page, second]) {
      await tab.waitForFunction(
        () => document.documentElement.dataset.iptubeTheme === "original"
      );
      assert.equal(await tab.locator("#logo").isVisible(), true);
      assert.equal(await tab.locator("#iptube-theme-logo").count(), 0);
      assert.equal(
        await tab.evaluate(() =>
          document.documentElement.style.getPropertyValue("--ipt-accent")
        ),
        ""
      );
    }
    await popup.locator('[data-theme="stranger-things"]').click();
    await popup
      .locator('[data-theme="stranger-things"][aria-pressed="true"]')
      .waitFor();
    // Exercise the real timeline, then ensure switching clears its owned DOM immediately.
    await page.goto("https://www.youtube.com/watch?v=SkcO47UDzzY");
    await page.evaluate(() => {
      document.querySelector("video").currentTime = 50;
    });
    await page.locator("body.st-burning-mode").waitFor();
    await popup.locator('[data-theme="original"]').click();
    await page.waitForFunction(
      () =>
        document.documentElement.dataset.iptubeTheme === "original" &&
        !document.body.classList.contains("st-burning-mode")
    );
    assert.equal(
      await page.locator(".st-burning-overlay, .st-ash-overlay").count(),
      0
    );
    // Preserve a native dark starting appearance as well as native light.
    await page.evaluate(() =>
      document.documentElement.setAttribute("dark", "")
    );
    await popup.locator('[data-theme="xbox"]').click();
    await page.waitForFunction(
      () => document.documentElement.dataset.iptubeTheme === "xbox"
    );
    await popup.locator('[data-theme="original"]').click();
    await page.waitForFunction(
      () => document.documentElement.dataset.iptubeTheme === "original"
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.hasAttribute("dark")),
      true
    );
    await popup.locator('[data-theme="stranger-things"]').click();
    await popup
      .locator('[data-theme="stranger-things"][aria-pressed="true"]')
      .waitFor();
    await popup.setViewportSize({ width: 460, height: 900 });
    await popup.screenshot({ path: "output/theme-picker.png", fullPage: true });
    assert.equal(
      await popup.evaluate(
        () => document.documentElement.scrollWidth > innerWidth
      ),
      false,
      "Picker has no horizontal overflow"
    );
    assert.deepEqual(errors, [], "No uncaught extension runtime errors");
    console.log(
      JSON.stringify({
        passed: true,
        themes: themes.length,
        browserVersion: context.browser().version(),
        checks:
          "rendered colors, buttons, progress, logos, persistence, native restoration, SPA, multiple tabs, keyboard"
      })
    );
  } finally {
    await context.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
