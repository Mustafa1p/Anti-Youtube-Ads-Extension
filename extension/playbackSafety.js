// ISOLATED world, document_start. Unknown settings fail open for playback.
const PlaybackSafety = (() => {
  "use strict";
  let enabled = false;
  let banner;
  let revision = 0;

  function publish() {
    document.documentElement?.setAttribute(
      "data-iptube-ad-cleanup",
      enabled ? "on" : "off"
    );
  }
  function apply(value) {
    enabled = value !== false;
    publish();
    if (!enabled) {
      banner?.remove();
      banner = null;
    }
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.adBlockingEnabled) {
      revision++;
      apply(changes.adBlockingEnabled.newValue);
    }
  });
  const initialRevision = revision;
  chrome.storage.local
    .get(["adBlockingEnabled"])
    .then((result) => {
      if (revision === initialRevision) apply(result.adBlockingEnabled);
    })
    .catch(() => {});
  // documentElement can be absent at document_start.
  if (!document.documentElement) {
    const observer = new MutationObserver(() => {
      if (document.documentElement) {
        publish();
        observer.disconnect();
      }
    });
    observer.observe(document, { childList: true });
  }

  function check() {
    if (!enabled || !document.body) return;
    const warning = document.querySelector(
      "ytd-enforcement-message-view-model, ytd-enforcement-message-renderer"
    );
    if (!warning) {
      banner?.remove();
      banner = null;
      return;
    }
    if (banner?.isConnected) return;
    banner = document.createElement("aside");
    banner.id = "iptube-playback-recovery";
    banner.setAttribute("role", "status");
    banner.style.cssText =
      "position:fixed;bottom:20px;right:20px;z-index:2147483647;background:#171717;color:#fff;padding:16px;max-width:360px;font:14px/1.5 sans-serif;border:1px solid #aaa;border-radius:8px";
    const text = document.createElement("p");
    text.textContent =
      "YouTube is showing a playback warning. You can pause IPTUBE ad blocking without removing the extension. Ads may play.";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Pause ad blocking and reload";
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const result = await chrome.runtime.sendMessage({
          type: "SET_AD_BLOCKING",
          enabled: false
        });
        if (!result?.ok) throw new Error("Unable to pause");
        location.reload();
      } catch {
        text.textContent =
          "Could not pause ad blocking. Reopen the extension popup and try again.";
        button.disabled = false;
      }
    });
    banner.append(text, button);
    document.body.appendChild(banner);
  }
  return Object.freeze({ isEnabled: () => enabled, check });
})();
