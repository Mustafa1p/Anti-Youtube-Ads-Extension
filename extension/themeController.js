const ThemeController = (() => {
  let active = ThemeSettings.DEFAULT_ID;
  let revision = 0;
  let nativeDark = null;

  function refreshBranding() {
    const renderer = document.querySelector("ytd-topbar-logo-renderer");
    const previous = document.getElementById("iptube-theme-logo");
    if (active === "original") {
      previous?.remove();
      return;
    }
    if (
      !renderer ||
      (previous?.parentElement === renderer &&
        previous.dataset.theme === active)
    )
      return;
    previous?.remove();
    const theme = ThemeSettings.get(active);
    const link = document.createElement("a");
    link.id = "iptube-theme-logo";
    link.dataset.theme = active;
    link.href = "/";
    link.title = `${theme.name} · YouTube home`;
    link.setAttribute("aria-label", `${theme.name} · YouTube home`);
    if (theme.asset) {
      const img = document.createElement("img");
      img.src = chrome.runtime.getURL(`themes/${theme.asset}`);
      img.alt = theme.name;
      link.appendChild(img);
    } else {
      link.textContent = theme.mark;
      link.className = "iptube-lettermark";
    }
    renderer.appendChild(link);
  }

  function apply(value) {
    active = ThemeSettings.normalize(value);
    const root = document.documentElement;
    // Native components now also use generated dark/light CSS, beyond yt-spec tokens.
    // Temporarily opt into their dark variants, preserving the user's starting state.
    if (active !== "original") {
      if (nativeDark === null) nativeDark = root.hasAttribute("dark");
      root.setAttribute("dark", "");
    } else if (nativeDark !== null) {
      if (nativeDark) root.setAttribute("dark", "");
      else root.removeAttribute("dark");
      nativeDark = null;
    }
    // Remove all owned variables before setting a new palette, including Original.
    for (const key of Object.keys(
      ThemeSettings.tokens(ThemeSettings.get(active))
    ))
      root.style.removeProperty(key);
    if (active !== "original") {
      for (const [key, token] of Object.entries(
        ThemeSettings.tokens(ThemeSettings.get(active))
      ))
        root.style.setProperty(key, token);
    }
    root.setAttribute("data-iptube-theme", active);
    refreshBranding();
    document.dispatchEvent(
      new CustomEvent("iptube-theme-changed", { detail: active })
    );
  }

  function init() {
    const initialRevision = revision;
    ThemeSettings.load()
      .then((value) => {
        if (revision === initialRevision) apply(value);
      })
      .catch((error) => {
        console.warn("[IPTUBE] Theme load failed", error);
        apply(active);
      });
    // YouTube replaces masthead nodes during SPA navigation and layout changes.
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        refreshBranding();
      });
    }).observe(document.body, { childList: true, subtree: true });
    document.addEventListener("yt-navigate-finish", refreshBranding);
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[ThemeSettings.STORAGE_KEY]) {
      revision++;
      apply(changes[ThemeSettings.STORAGE_KEY].newValue);
    }
  });
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
  return Object.freeze({ getTheme: () => active, refreshBranding });
})();
