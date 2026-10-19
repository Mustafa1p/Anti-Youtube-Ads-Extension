let hudIntervalId = null;
let domObserver = null;
let hasInvalidatedContext = false;
let pageEventHandler = null;
let chipSelectionHandle = null;
let mutationFrameId = null;

function scheduleChipSelection() {
  if (chipSelectionHandle) {
    clearTimeout(chipSelectionHandle);
  }
  chipSelectionHandle = setTimeout(() => {
    chipSelectionHandle = null;
    try {
      selectDefaultChip(document);
    } catch (error) {
      console.debug("[CTF-Blocker] chip selection failed", error);
    }
  }, 150);
}
function canMessageRuntime() {
  try {
    return (
      typeof chrome !== "undefined" &&
      !!chrome.runtime &&
      typeof chrome.runtime.sendMessage === "function" &&
      !!chrome.runtime.id
    );
  } catch (error) {
    return false;
  }
}

function collectMatches(root, selector) {
  const matches = new Set();
  const scope = root ?? document;
  const maybeAdd = (node) => {
    if (node) {
      matches.add(node);
    }
  };

  if (scope?.matches?.(selector)) {
    maybeAdd(scope);
  }

  scope?.querySelectorAll?.(selector)?.forEach((node) => {
    maybeAdd(node);
  });

  return Array.from(matches);
}

function removeStaticAds(root = document) {
  const scope = root ?? document;
  AD_SELECTORS.forEach((selector) => {
    collectMatches(scope, selector).forEach((node) => node.remove());
  });

  pruneSponsoredRichItems(scope);
  removeShortsShelves(scope);
  ensureSuperVolumeControls(scope);
  ensureLoopControls();
}

function scrubPlayerAds() {
  const video = document.querySelector("video.html5-main-video");
  const adOverlay = document.querySelector(".ytp-ad-player-overlay");
  const adText = document.querySelector(".ytp-ad-text");
  const skipButton = document.querySelector(".ytp-ad-skip-button.ytp-button");

  if (skipButton) {
    skipButton.click();
  }

  if (adOverlay) {
    adOverlay.remove();
  }

  if (adText && /ad/i.test(adText.textContent ?? "")) {
    adText.remove();
  }

  if (video && document.body.classList.contains("ad-showing")) {
    video.currentTime = video.duration || video.currentTime;
    document.body.classList.remove("ad-showing");
  }
}

function pruneSponsoredRichItems(root = document) {
  collectMatches(root, RICH_ITEM_SELECTOR).forEach((item) => {
    const hasMedia = item.querySelector(
      "ytd-rich-grid-media, ytd-rich-grid-playlist-renderer, ytd-rich-grid-channel-renderer, yt-lockup-view-model"
    );
    const hasAdSignals = item.querySelector(
      "ytd-display-ad-renderer, ytd-ad-slot-renderer, ytd-promoted-video-renderer"
    );
    const contentContainer = item.querySelector("#content");
    const isVisiblyEmpty =
      contentContainer && contentContainer.children.length === 0;
    const playableLink = item.querySelector(
      'a[href^="/watch"], a[href^="/live"], a[href^="/shorts"], a[href^="/playlist"]'
    );
    const hasMetadata = item.querySelector(
      "yt-lockup-metadata-view-model, ytd-video-meta-block, h3.yt-lockup-metadata-view-model__heading-reset"
    );
    const hasRenderableContent = hasMedia && (playableLink || hasMetadata);

    if (hasAdSignals || isVisiblyEmpty || !hasRenderableContent) {
      item.remove();
    }
  });
}

function removeShortsShelves(root = document) {
  collectMatches(root, SHORTS_SHELF_SELECTOR).forEach((shelf) => {
    const title = shelf
      .querySelector("#title")
      ?.textContent?.trim()
      .toLowerCase();
    const hasShortsLockup = shelf.querySelector(
      "ytm-shorts-lockup-view-model, ytd-reel-shelf-renderer"
    );
    if ((title && title.includes("shorts")) || hasShortsLockup) {
      shelf.remove();
    }
  });
}

function selectDefaultChip(filterRoot = document) {
  const containers = filterRoot.querySelectorAll?.(
    "yt-related-chip-cloud-renderer, ytd-related-chip-cloud-renderer"
  );
  if (!containers?.length) {
    return;
  }
  containers.forEach((container) => {
    const chips = Array.from(
      container.querySelectorAll("yt-chip-cloud-chip-renderer")
    );
    if (chips.length < 2) {
      return;
    }
    const preferredIndex = Math.min(2, chips.length - 1);
    const fallbackChip = chips[chips.length - 1];
    const targetButton =
      getChipButton(chips[preferredIndex]) || getChipButton(fallbackChip);
    if (
      !targetButton ||
      targetButton.getAttribute("aria-selected") === "true"
    ) {
      return;
    }
    targetButton.click();
    // Re-assert selection shortly after click because YouTube may re-render the chips.
    setTimeout(() => {
      if (targetButton.getAttribute("aria-selected") !== "true") {
        scheduleChipSelection();
      }
    }, 200);
  });
}

function getChipButton(chipRenderer) {
  if (!chipRenderer) {
    return null;
  }
  return (
    chipRenderer.querySelector("button[role='tab']") ||
    chipRenderer.querySelector("chip-shape button") ||
    chipRenderer.shadowRoot?.querySelector?.("button[role='tab'], button") ||
    chipRenderer.firstElementChild?.shadowRoot?.querySelector?.("button") ||
    null
  );
}

/**
 * Ensures the comments section is visible on watch pages.
 * YouTube may hide comments via hidden attribute, collapsed state, or JS manipulation.
 */
let _commentsFixApplied = false;

function ensureCommentsVisible() {
  if (!isWatchPage()) {
    _commentsFixApplied = false;
    return;
  }

  // Only apply once per navigation - avoids layout thrashing on every mutation
  if (_commentsFixApplied) {
    return;
  }

  // Use attribute-based fixes only (no getComputedStyle - avoids forced layout)
  const commentsSelectors = [
    "ytd-comments#comments",
    "ytd-comments.ytd-watch-flexy",
    "#comments.ytd-watch-flexy"
  ];

  let found = false;
  commentsSelectors.forEach((selector) => {
    const element = document.querySelector(selector);
    if (element) {
      element.removeAttribute("hidden");
      element.removeAttribute("collapsed");
      found = true;
    }
  });

  // Ensure item-section-renderer inside comments is visible
  const commentSections = document.querySelectorAll(
    "ytd-comments ytd-item-section-renderer"
  );
  commentSections.forEach((section) => {
    section.removeAttribute("hidden");
  });

  if (found) {
    _commentsFixApplied = true;
  }
}

function ensureHud() {
  if (!HUD_ENABLED) {
    const existing = document.getElementById(HUD_ID);
    if (existing) {
      existing.remove();
    }
    return;
  }

  if (document.getElementById(HUD_ID)) {
    return;
  }

  const hud = document.createElement("div");
  hud.id = HUD_ID;
  hud.style.cssText = [
    "position:fixed",
    "z-index:999999",
    "top:16px",
    "right:16px",
    "padding:8px 12px",
    "background:#0f0f0f",
    "color:#00e5ff",
    "font-family:Inter,Roboto,sans-serif",
    "font-size:12px",
    "border-radius:6px",
    "box-shadow:0 4px 12px rgba(0,0,0,0.4)",
    "cursor:default",
    "user-select:none"
  ].join(";");

  const textSpan = document.createElement("span");
  textSpan.id = `${HUD_ID}-text`;
  textSpan.textContent = "Blocking YouTube ads…";

  const resetButton = document.createElement("button");
  resetButton.textContent = "reset";
  resetButton.style.cssText = [
    "margin-left:8px",
    "padding:2px 6px",
    "font-size:11px",
    "border:none",
    "border-radius:4px",
    "background:#272727",
    "color:#fff"
  ].join(";");

  resetButton.addEventListener("click", () => {
    safeSendMessage({ type: "RESET_BLOCK_STATS" }, () => {
      updateHud();
    });
  });

  hud.appendChild(textSpan);
  hud.appendChild(resetButton);
  document.body.appendChild(hud);
}

function setHudText(text) {
  if (!HUD_ENABLED) {
    return;
  }
  const textSpan = document.getElementById(`${HUD_ID}-text`);
  if (textSpan) {
    textSpan.textContent = text;
  }
}

function teardownOnInvalidation() {
  if (hasInvalidatedContext) {
    return;
  }
  hasInvalidatedContext = true;
  BrowserFeatures.stop();
  if (hudIntervalId) {
    clearInterval(hudIntervalId);
    hudIntervalId = null;
  }
  if (domObserver) {
    domObserver.disconnect();
    domObserver = null;
  }
  if (sidebarCurateHandle) {
    clearTimeout(sidebarCurateHandle);
    sidebarCurateHandle = null;
  }
  if (chipSelectionHandle) {
    clearTimeout(chipSelectionHandle);
    chipSelectionHandle = null;
  }
  if (pageEventHandler) {
    window.removeEventListener("message", pageEventHandler);
    pageEventHandler = null;
  }
  setHudText("Extension reloading…");
}

function safeSendMessage(payload, onSuccess) {
  if (hasInvalidatedContext) {
    teardownOnInvalidation();
    return;
  }

  if (!canMessageRuntime()) {
    teardownOnInvalidation();
    return;
  }

  try {
    chrome.runtime.sendMessage(payload, (response) => {
      if (chrome.runtime.lastError) {
        const message = chrome.runtime.lastError.message || "unknown";
        if (/context invalidated/i.test(message)) {
          teardownOnInvalidation();
        } else {
          console.debug("[CTF-Blocker] runtime message error", message);
        }
        return;
      }
      onSuccess?.(response);
    });
  } catch (error) {
    console.debug("[CTF-Blocker] runtime message failed", error);
    teardownOnInvalidation();
  }
}

function bindPageBridge() {
  if (pageEventHandler) {
    window.removeEventListener("message", pageEventHandler);
  }

  pageEventHandler = (event) => {
    if (event.source !== window) {
      return;
    }

    const data = event.data;
    if (
      !data ||
      data.source !== "CTF_ADBLOCKER" ||
      data.type !== "AD_REQUEST_BLOCKED"
    ) {
      return;
    }

    safeSendMessage({ type: "INCREMENT_BLOCK_COUNT" }, (response) => {
      if (HUD_ENABLED) {
        const count = response?.blockedRequestCount ?? 0;
        setHudText(`Ads blocked: ${count}`);
      }
    });
  };

  window.addEventListener("message", pageEventHandler);
}

function updateHud() {
  if (!HUD_ENABLED) {
    return;
  }
  safeSendMessage({ type: "GET_BLOCK_STATS" }, (response) => {
    const count = response?.blockedRequestCount ?? 0;
    setHudText(`Ads blocked: ${count}`);
  });
}

// Unified debounced mutation handling - prevents cascading observer storms
let _mutationPending = false;
let _mutationSidebarHint = false;
let _mutationChipHint = false;

function initMutationObserver() {
  domObserver = new MutationObserver((mutations) => {
    // Collect hints from mutations without doing heavy work
    for (const mutation of mutations) {
      if (mutation.type !== "childList") continue;

      if (
        isWatchPage() &&
        mutation.target instanceof Element &&
        mutation.target.closest?.("#secondary")
      ) {
        _mutationSidebarHint = true;
      }
      if (
        mutation.target instanceof Element &&
        (mutation.target.closest?.("yt-related-chip-cloud-renderer") ||
          mutation.target.closest?.("ytd-related-chip-cloud-renderer"))
      ) {
        _mutationChipHint = true;
      }
    }

    // Debounce all heavy work into a single rAF batch
    if (!_mutationPending) {
      _mutationPending = true;
      mutationFrameId = requestAnimationFrame(processMutationBatch);
    }
  });

  domObserver.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}

function processMutationBatch() {
  mutationFrameId = null;
  _mutationPending = false;
  if (hasInvalidatedContext) return;

  removeStaticAds();
  scrubPlayerAds();
  applyPremiumBranding();
  blockUpsellElements();

  if (isWatchPage()) {
    ensureCommentsVisible();
  }

  if (_mutationSidebarHint) {
    _mutationSidebarHint = false;
    scheduleSidebarCurate();
  }
  if (_mutationChipHint) {
    _mutationChipHint = false;
    scheduleChipSelection();
  }
}

function bootstrap() {
  BrowserFeatures.start();
  ensureSuperVolumePreferenceLoaded();
  loadLoopPreference();
  loadDolbyAtmosPreference();
  ensureHud();
  removeStaticAds();
  scrubPlayerAds();
  applyPremiumBranding();
  ensureSuperVolumeControls();
  ensureLoopControls();
  ensureDolbyAtmosControls();
  ensureCommentsVisible();
  scheduleChipSelection();
  bindSidebarCurator();
  bindPageBridge();
  initMutationObserver();
  enhanceVideoQualityUI();
  blockPremiumUpsells();
  if (HUD_ENABLED) {
    updateHud();
    if (hudIntervalId) {
      clearInterval(hudIntervalId);
    }
    hudIntervalId = setInterval(updateHud, 5000);
  }
}

function enhanceVideoQualityUI() {
  // Enhancement is handled on-demand when quality menu opens,
  // not via a separate MutationObserver (merged into main observer).
  // This function is called from bootstrap to do initial check.
  enhanceQualityMenuItems();
}

function enhanceQualityMenuItems() {
  const qualityMenu = document.querySelector(
    ".ytp-quality-menu, .ytp-settings-menu"
  );
  if (!qualityMenu) return;

  const menuItems = qualityMenu.querySelectorAll(
    '.ytp-menuitem[role="menuitemradio"]'
  );
  menuItems.forEach((item) => {
    const label = item.querySelector(".ytp-menuitem-label");
    if (label && !item.dataset.enhanced) {
      item.dataset.enhanced = "true";
      const text = label.textContent || "";
      if (
        text.includes("1080p") ||
        text.includes("1440p") ||
        text.includes("2160p") ||
        text.includes("4K")
      ) {
        if (!label.querySelector(".premium-badge")) {
          const badge = document.createElement("span");
          badge.className = "premium-badge";
          badge.style.cssText =
            "margin-left: 4px; font-size: 10px; color: #ff0000; font-weight: bold;";
          badge.textContent = " HD";
          label.appendChild(badge);
        }
      }
    }
  });
}

// Lightweight upsell blocker - called from debounced mutation batch, no separate observer/interval
function blockUpsellElements() {
  const upsellSelectors = [
    "ytd-premium-upsell-renderer",
    "ytd-premium-upsell-dialog-renderer",
    ".premium-yoodle",
    "yt-upsell-dialog-renderer"
  ];

  upsellSelectors.forEach((selector) => {
    const elements = document.querySelectorAll(selector);
    elements.forEach((el) => el.remove());
  });

  // Remove dialogs that mention premium features
  const dialogs = document.querySelectorAll("tp-yt-paper-dialog");
  dialogs.forEach((dialog) => {
    const text = dialog.textContent?.toLowerCase() || "";
    if (
      text.includes("enjoy enhanced quality") ||
      (text.includes("premium") && text.includes("trial")) ||
      (text.includes("youtube music") && text.includes("ad-free")) ||
      (text.includes("iqd") && text.includes("month"))
    ) {
      dialog.remove();
    }
  });

  // Remove backdrop/overlay when upsell is blocked
  const backdrops = document.querySelectorAll("tp-yt-iron-overlay-backdrop");
  backdrops.forEach((backdrop) => {
    backdrop.remove();
  });
}

function blockPremiumUpsells() {
  // Initial run - subsequent calls handled by debounced mutation observer
  blockUpsellElements();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}

window.addEventListener("pagehide", () => {
  teardownOnInvalidation();
});
