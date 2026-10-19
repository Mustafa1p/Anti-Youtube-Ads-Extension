/**
 * Storage sanitizer - clears YouTube's persistent ad-block detection markers
 * from localStorage, sessionStorage, and IndexedDB on every page load.
 *
 * Runs at document_start in ISOLATED world so it can access storage APIs
 * before YouTube's scripts check for violations.
 */
(function storageSanitizer() {
  "use strict";

  const DETECTION_KEY_PATTERNS = [
    /ad.*block/i,
    /block.*ad/i,
    /enforce/i,
    /violation/i,
    /yt.*dismiss/i,
    /yt.*banner/i,
    /consent.*ad/i,
    /ad.*consent/i,
    /player.*ad.*count/i,
    /ad.*blocker.*shown/i,
    /monetization.*check/i,
    // Bot detection patterns — kept specific to avoid clearing legitimate storage
    /bot.*detect/i,
    /captcha/i,
    /session.*challenge/i,
    /verify.*human/i,
    /headless/i,
    /ad.*strike|strike.*ad|enforce.*strike/i
  ];

  const DETECTION_COOKIE_PATTERNS = [
    /ad.*block/i,
    /block.*detection/i,
    /enforce/i,
    /violation/i
  ];

  // Preserve authentication cookies - NEVER delete these
  const AUTH_COOKIE_WHITELIST = new Set([
    "SID",
    "HSID",
    "SSID",
    "APISID",
    "SAPISID",
    "__Secure-1PSID",
    "__Secure-3PSID",
    "__Secure-1PAPISID",
    "__Secure-3PAPISID",
    "LOGIN_INFO",
    "SIDCC",
    "__Secure-1PSIDCC",
    "__Secure-3PSIDCC"
  ]);

  function matchesPattern(key, patterns) {
    if (!key) return false;
    return patterns.some((regex) => regex.test(key));
  }

  function sanitizeStorage(storage, label) {
    if (!storage) return 0;

    let removed = 0;
    const keysToRemove = [];

    try {
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (matchesPattern(key, DETECTION_KEY_PATTERNS)) {
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach((key) => {
        storage.removeItem(key);
        removed++;
      });

      if (removed > 0) {
        console.debug(
          `[CTF-Storage] Removed ${removed} detection keys from ${label}`
        );
      }
    } catch (error) {
      console.debug(`[CTF-Storage] Failed to sanitize ${label}:`, error);
    }

    return removed;
  }

  function sanitizeCookies() {
    if (!document.cookie) return 0;

    let removed = 0;
    const cookies = document.cookie.split(";");

    // Only clear detection-related cookies, preserve auth cookies
    cookies.forEach((cookie) => {
      const [fullKey] = cookie.split("=");
      const key = fullKey?.trim();

      if (!key) return;

      // NEVER delete authentication cookies
      if (AUTH_COOKIE_WHITELIST.has(key)) {
        return;
      }

      // Only delete if matches detection pattern
      if (matchesPattern(key, DETECTION_COOKIE_PATTERNS)) {
        try {
          const domains = [
            "",
            window.location.hostname,
            `.${window.location.hostname}`,
            ".youtube.com",
            ".google.com"
          ];

          const paths = ["/", "/watch", "/feed"];

          domains.forEach((domain) => {
            paths.forEach((path) => {
              document.cookie = `${key}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${path}; domain=${domain}`;
              document.cookie = `${key}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${path}; domain=${domain}; secure`;
            });
          });

          removed++;
        } catch (error) {
          // Best effort
        }
      }
    });

    if (removed > 0) {
      console.debug(
        `[CTF-Storage] Removed ${removed} detection cookies (auth preserved)`
      );
    }

    return removed;
  }

  function sanitizeIndexedDB() {
    if (!window.indexedDB) return;

    try {
      // Only clear databases that store detection/remote state.
      // DO NOT delete yt-player or yt-player-local-media — those store
      // player preferences, quality settings, and session config.
      const dbNames = [
        "yt-player-bandaid-host",
        "yt-remote",
        "YtIdbMeta1#",
        "YtIdbMeta2#"
      ];

      dbNames.forEach((dbName) => {
        try {
          const request = indexedDB.deleteDatabase(dbName);
          request.onsuccess = () => {
            console.debug(`[CTF-Storage] Cleared IndexedDB: ${dbName}`);
          };
        } catch (e) {
          // Continue with others
        }
      });
    } catch (error) {
      console.debug("[CTF-Storage] Failed to sanitize IndexedDB:", error);
    }
  }

  function clearServiceWorkers() {
    if (!navigator.serviceWorker) return;

    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => {
        registrations.forEach((registration) => {
          if (registration.scope.includes("youtube.com")) {
            registration.unregister().then(() => {
              console.debug(
                "[CTF-Storage] Unregistered service worker:",
                registration.scope
              );
            });
          }
        });
      })
      .catch(() => {});
  }

  function performSanitization() {
    const localCount = sanitizeStorage(localStorage, "localStorage");
    const sessionCount = sanitizeStorage(sessionStorage, "sessionStorage");
    const cookieCount = sanitizeCookies();

    // Only clear IndexedDB/ServiceWorkers if we found detection markers
    if (localCount > 0 || sessionCount > 0 || cookieCount > 0) {
      sanitizeIndexedDB();
      clearServiceWorkers();
    }

    const total = localCount + sessionCount + cookieCount;
    if (total > 0) {
      console.info(
        `[CTF-Storage] Cleared ${total} detection markers (auth preserved)`
      );
    }
  }

  // Run immediately
  performSanitization();

  // Re-run periodically in case YouTube writes markers dynamically
  setInterval(performSanitization, 30000);

  // Also run on visibility change (when user returns to tab)
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      performSanitization();
    }
  });
})();
