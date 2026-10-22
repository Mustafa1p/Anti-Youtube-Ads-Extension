/* eslint-env browser */

(() => {
  "use strict";

  // Capture native Function.prototype.toString BEFORE any patches so every
  // patched function can be registered and returned as "[native code]".
  // YouTube's primary ad-blocker detection check is:
  //   Function.prototype.toString.call(window.fetch) !== "function fetch() { [native code] }"
  const _nativeToString = Function.prototype.toString;
  const _nativified = new WeakSet();
  function nativefy(fn, original) {
    _nativified.add(fn);
    try {
      Object.defineProperty(fn, "name", {
        value:
          (typeof original === "function" ? original.name : null) ||
          fn.name ||
          "",
        configurable: true,
        enumerable: false,
        writable: false
      });
    } catch (_e) {}
    return fn;
  }
  try {
    const _patchedToString = function toString() {
      if (_nativified.has(this)) {
        return `function ${this.name || ""}() { [native code] }`;
      }
      return _nativeToString.call(this);
    };
    _nativified.add(_patchedToString);
    Object.defineProperty(Function.prototype, "toString", {
      value: _patchedToString,
      configurable: true,
      enumerable: false,
      writable: true
    });
  } catch (_e) {}

  // Patch postMessage to suppress cross-origin errors from YouTube's internal code
  // (e.g., youtube.com <-> studio.youtube.com communication)
  const originalPostMessage = window.postMessage.bind(window);
  window.postMessage = function patchedPostMessage(
    message,
    targetOrigin,
    transfer
  ) {
    try {
      let safeTargetOrigin = targetOrigin;

      // If YouTube code uses a strict origin that doesn't match this window, calling
      // postMessage will throw. For YouTube↔YouTube communication (e.g. www <-> studio),
      // downgrade targetOrigin to "*" to preserve behavior without console noise.
      if (typeof targetOrigin === "string" && targetOrigin !== "*") {
        const currentOrigin = window.location.origin;
        const isYouTubeOrigin = (origin) => {
          try {
            const hostname = new URL(origin).hostname;
            return (
              hostname === "youtube.com" || hostname.endsWith(".youtube.com")
            );
          } catch {
            return false;
          }
        };

        if (
          targetOrigin !== currentOrigin &&
          isYouTubeOrigin(targetOrigin) &&
          isYouTubeOrigin(currentOrigin)
        ) {
          safeTargetOrigin = "*";
        }
      }

      if (arguments.length >= 3) {
        return originalPostMessage(message, safeTargetOrigin, transfer);
      }
      return originalPostMessage(message, safeTargetOrigin);
    } catch (error) {
      // Silently suppress postMessage errors (cross-origin issues)
      if (
        error?.name === "DataCloneError" ||
        error?.message?.includes("target origin") ||
        error?.message?.includes("cross-origin")
      ) {
        return;
      }
      // Re-throw other errors
      throw error;
    }
  };
  nativefy(window.postMessage, originalPostMessage);

  const HARD_BLOCK_KEYS = new Set([
    "adPlacements",
    "playerAds",
    "adSlotting",
    "adSlots",
    "adBreakServiceSettings",
    "adSignalsInfo",
    "adSafetyReason",
    "adDisplayConfig",
    "adRenderers",
    "adInfoRenderer",
    "adBreaks",
    "adParams",
    "adPod",
    "adMarkers",
    "playerAdsOverlay",
    "watchAdsInfo",
    "promotedSparklesTextSearchRenderer",
    "promotedSparklesWebRenderer",
    "promotedTweetRenderer",
    "promotedVideoRenderer",
    "promotedSkippableVideoRenderer",
    "promotedProductRenderer",
    "sponsorshipsRenderer",
    "paidContentOverlayRenderer",
    "campaign",
    // Premium upsell keys — keep only the clearly upsell-specific ones
    "upsellViewModel",
    "upsellDialogRenderer",
    "premiumUpsellRenderer",
    "premiumUpsellDialogRenderer"
    // NOTE: dialogViewModel / panelFooterViewModel / buttonViewModel removed —
    // these are YouTube's generic UI components used for player controls,
    // quality dialogs, like buttons, etc. Deleting them crashes the player.
  ]);

  const KEY_PATTERNS = [
    /^ad(?!ap|ditional|just|aptive|min)/i, // "admin" should not be blocked
    /^promoted(?!Comment|Reply)/i, // Don't block promotedComment/promotedReply
    /^sponsor(?!Button|Channel)/i, // Don't block sponsorButton or sponsorChannel (legit features)
    /paidcontent/i,
    /pagead/i,
    /companionad/i,
    /upsell/i, // Block all upsell-related keys
    /premium.*upsell/i
  ];

  const BLOCK_URL_PATTERNS = [
    /youtube\.com\/api\/stats\/watchtime.*(el=adunit|is_ad=1|adformat=)/i,
    /youtube\.com\/api\/stats\/ads/i,
    /youtube\.com\/pagead\//i,
    /doubleclick\.net\/.*(ad|pagead|gampad)/i,
    /youtube\.com\/youtubei\/v\d+\/get_panel\?.*panelId.*premium_upsell/i
  ];

  const ENFORCEMENT_REASON_PATTERNS = [
    /ad blockers violate/i,
    /video playback is blocked/i,
    /allowlist youtube/i,
    /turn off your ad blocker/i,
    /ads allow youtube/i,
    // Bot detection patterns
    /confirm.*you.*not.*bot/i,
    /sign.*in.*confirm/i,
    /unusual traffic/i,
    /automated.*requests/i,
    /verify.*human/i,
    /captcha/i,
    /challenge/i,
    /suspicious.*activity/i,
    /bot.*detected/i,
    /please.*sign.*in/i,
    /verify.*identity/i
  ];

  const ENFORCEMENT_RENDERER_KEYS = new Set([
    "adBlockerMessageRenderer",
    "adBlockerMessage",
    "adblockerdialogrenderer",
    "enforcementMessageRenderer",
    "enforcementEntity",
    // Bot challenge renderers
    "botGuardRenderer",
    "challengeRenderer",
    "captchaRenderer",
    "verificationRenderer",
    "signInRenderer",
    "restrictedSignInRenderer",
    "verifyRenderer",
    "humanVerificationRenderer",
    // Premium upsell renderers
    "upsellViewModel",
    "upsellDialogRenderer",
    "premiumUpsellRenderer",
    "premiumUpsellDialogRenderer"
    // NOTE: liveChatActionPanelRenderer, panelFooterViewModel, dialogViewModel removed —
    // liveChatActionPanelRenderer is a legitimate YouTube chat feature;
    // panelFooterViewModel and dialogViewModel are generic UI components used
    // by the player for quality settings, share dialogs, etc.
  ]);

  const ENFORCEMENT_FLAG_KEYS = [
    "web_player_enable_ad_blocker_enforcement",
    "html5_enable_ad_block_detection",
    "web_player_disable_ads_on_enforcement",
    "web_player_show_enforcement_message",
    "web_player_skip_ad_button_with_delay_killswitch",
    "kevlar_watch_verify_ads_blocked",
    "web_player_embedded_enable_ad_blocker_enforcement",
    "desktop_player_attestation_enable",
    "player_double_afc_explicit_hardening",
    "enable_web_player_google_ads_measurable",
    "web_player_ads_strike_count",
    "web_player_ads_strike_limit",
    "web_player_show_ads_enforcement_notification",
    // Bot detection flags
    "enable_bot_guard",
    "enable_botguard_attestation",
    "enable_client_sli_logging",
    "web_player_enable_client_flags_logging",
    "enable_player_attestation",
    "enable_player_integrity",
    "player_attestation_required",
    "disable_new_pause_state3",
    "web_logging_max_batch",
    "enable_dsp",
    "enable_client_integrity_check",
    "enable_premium_voluntary_pause",
    "enable_gel_log_commands",
    "web_player_enable_rv_pip",
    "enable_inline_preview_refresh_hover"
  ];

  // Account-level features that indicate ad-block status
  const ACCOUNT_ENFORCEMENT_KEYS = new Set([
    "adBlockerDetected",
    "adBlockViolation",
    "adsBlockedCount",
    "enforcementNotification",
    "violationCount",
    "strikeCount",
    "adsMuted"
  ]);

  const PLAYER_ENDPOINT_REGEX = /\/youtubei\/v\d+\/player/i;
  const SPOOF_VISITOR_PREFIX = "CgtJUFRCX1ZJU0lUT1I="; // base64("IPTB_VISITOR")

  function getOriginalYtcfgValue(key) {
    return window.__ctfOriginalYtcfg?.[key];
  }

  function getSpoofVisitorData() {
    if (window.__ctfSpoofVisitorData) {
      return window.__ctfSpoofVisitorData;
    }
    const seed =
      getOriginalYtcfgValue("visitorData") ||
      Math.random().toString(36).slice(2);
    const encoded = btoa(`${SPOOF_VISITOR_PREFIX}_${seed}`).replace(/=+$/, "");
    window.__ctfSpoofVisitorData = encoded.slice(0, 32);
    return window.__ctfSpoofVisitorData;
  }

  function normalizeHeadersInit(headersInit) {
    if (!headersInit) {
      return {};
    }
    if (headersInit instanceof Headers) {
      const result = {};
      headersInit.forEach((value, key) => {
        result[key] = value;
      });
      return result;
    }
    if (Array.isArray(headersInit)) {
      return headersInit.reduce((acc, entry) => {
        if (Array.isArray(entry) && entry[0]) {
          acc[entry[0]] = entry[1];
        }
        return acc;
      }, {});
    }
    return { ...headersInit };
  }

  function ensureVisitorHeader(headers) {
    const next = { ...headers };
    // Keep all existing auth/identity headers to avoid breaking player requests.
    next["x-goog-visitor-id"] = getSpoofVisitorData();
    return next;
  }

  function spoofPlayerRequestBody(body) {
    if (typeof body !== "string" || !body.trim().startsWith("{")) {
      return body;
    }
    try {
      const payload = JSON.parse(body);
      const context = (payload.context = payload.context || {});
      const client = (context.client = context.client || {});
      // Avoid forcing logged-out state; it can break playback for some accounts/regions.
      // Only ensure visitorData is stable.
      client.visitorData = client.visitorData || getSpoofVisitorData();
      client.userInterfaceTheme = client.userInterfaceTheme || "CLASSIC";
      client.mainAppWebInfo = client.mainAppWebInfo || {};
      client.mainAppWebInfo.graftUrl =
        client.mainAppWebInfo.graftUrl ||
        `${window.location.pathname}${window.location.search}`;

      const request = (context.request = context.request || {});
      request.internalExperimentFlags = request.internalExperimentFlags || [];

      payload.playbackContext = payload.playbackContext || {};
      payload.playbackContext.contentPlaybackContext =
        payload.playbackContext.contentPlaybackContext || {};
      if (
        !payload.playbackContext.contentPlaybackContext.signatureTimestamp &&
        typeof window.ytcfg?.get === "function"
      ) {
        payload.playbackContext.contentPlaybackContext.signatureTimestamp =
          window.ytcfg.get("STS");
      }
      payload.racyCheckOk = true;
      payload.contentCheckOk = true;
      return JSON.stringify(payload);
    } catch (error) {
      return body;
    }
  }

  function applyLoggedOutSpoof(input, init) {
    const targetUrl = normalizeUrlCandidate(input);
    if (!targetUrl || !PLAYER_ENDPOINT_REGEX.test(targetUrl)) {
      return { input, init };
    }

    // Request object -> clone into new Request with sanitized headers/body
    if (typeof Request !== "undefined" && input instanceof Request) {
      try {
        const spoofedHeaders = ensureVisitorHeader(
          normalizeHeadersInit(input.headers)
        );
        const spoofedRequest = new Request(input, {
          // Preserve credentials/mode/cache to avoid breaking the player request.
          headers: spoofedHeaders,
          redirect: input.redirect,
          referrer: input.referrer,
          referrerPolicy: input.referrerPolicy,
          integrity: input.integrity,
          keepalive: input.keepalive,
          signal: input.signal
        });

        // When Request was constructed without explicit body in init, constructor reuses original body stream.
        return { input: spoofedRequest, init };
      } catch (error) {
        console.warn("[IPTUBE-X] Unable to spoof Request payload:", error);
        return { input, init };
      }
    }

    if (typeof input !== "string" && !(input instanceof URL)) {
      return { input, init };
    }

    const clonedInit = init ? { ...init } : {};
    clonedInit.headers = ensureVisitorHeader(
      normalizeHeadersInit(clonedInit.headers)
    );
    if (typeof clonedInit.body === "string") {
      clonedInit.body = spoofPlayerRequestBody(clonedInit.body);
    }
    return { input: targetUrl, init: clonedInit };
  }

  function normalizeUrlCandidate(target) {
    try {
      if (typeof target === "string") {
        return new URL(target, window.location.href).href;
      }
      if (target instanceof URL) {
        return target.href;
      }
      if (typeof Request !== "undefined" && target instanceof Request) {
        return target.url;
      }
      if (target && typeof target.url === "string") {
        return new URL(target.url, window.location.href).href;
      }
    } catch (error) {
      // Ignore malformed URLs; they'll simply bypass the drop logic.
    }
    return null;
  }

  function getBlockedUrl(target) {
    const normalized = normalizeUrlCandidate(target);
    if (!normalized) {
      return null;
    }
    return BLOCK_URL_PATTERNS.some((regex) => regex.test(normalized))
      ? normalized
      : null;
  }

  function enhanceVideoQuality(responseObj) {
    if (!isObject(responseObj)) return;
    try {
      // Only strip premium upsell overlays from player responses.
      // DO NOT touch streamingData, bitrates, or ABR URLs — modifying those
      // causes freezing, buffering, and black-screen playback failures.
      delete responseObj.premiumUpsellRenderer;
      delete responseObj.upsellDialogRenderer;
    } catch (error) {
      // Ignore
    }
  }

  function notifyBlocked(kind, url) {
    try {
      window.postMessage(
        {
          source: "CTF_ADBLOCKER",
          type: "AD_REQUEST_BLOCKED",
          detail: { kind, url }
        },
        window.location.origin
      );
    } catch (error) {
      // Silently ignore postMessage errors (cross-origin, serialization, etc.)
    }
  }

  function isObject(value) {
    return value !== null && typeof value === "object";
  }

  function looksPromotedNode(value) {
    if (!isObject(value)) {
      return false;
    }

    // Check for ad-specific renderer keys, but exclude comment-related nodes
    const keys = Object.keys(value);

    // If this looks like a comment/reply node, don't treat it as promoted
    if (keys.some((key) => /^comment|^reply|continuation/i.test(key))) {
      return false;
    }

    return keys.some((key) =>
      /^promotedVideo|^promotedSparkles|^adRenderer|^adSlotRenderer|^sponsoredVideo/i.test(
        key
      )
    );
  }

  function looksEnforcementNode(value) {
    if (!isObject(value)) {
      return false;
    }
    return Object.keys(value).some((key) => ENFORCEMENT_RENDERER_KEYS.has(key));
  }

  function shouldBlankKey(key) {
    if (HARD_BLOCK_KEYS.has(key)) {
      return true;
    }
    return KEY_PATTERNS.some((regex) => regex.test(key));
  }

  function blankValue(target) {
    if (Array.isArray(target)) {
      target.length = 0;
      return;
    }
    if (isObject(target)) {
      Object.keys(target).forEach((key) => delete target[key]);
      return;
    }
  }

  function shouldNeutralizePlayability(status) {
    if (!isObject(status)) {
      return false;
    }
    if (status.status === "OK") {
      return false;
    }

    const reasonParts = [];
    if (typeof status.reason === "string") {
      reasonParts.push(status.reason);
    }
    if (Array.isArray(status.messages)) {
      reasonParts.push(status.messages.join(" "));
    }
    const reason = reasonParts.join(" ").toLowerCase();

    // For ERROR status, only neutralize when there is a clear enforcement reason.
    // Generic errors (network failures, private/deleted videos) must not be overridden
    // because that leaves the player stuck in a broken "playing" state.
    if (status.status === "ERROR") {
      if (!reason) return false;
      return ENFORCEMENT_REASON_PATTERNS.some((regex) => regex.test(reason));
    }

    // Do NOT neutralize statuses with no reason — a missing reason means the
    // video is genuinely unavailable (geo-restricted, private, deleted, etc.).
    // Overriding those to OK causes the player to crash trying to play unplayable content.
    if (!reason) return false;

    return ENFORCEMENT_REASON_PATTERNS.some((regex) => regex.test(reason));
  }

  function neutralizePlayability(status) {
    if (!isObject(status)) {
      return;
    }
    status.status = "OK";
    status.reason = "";
    status.errorScreen = undefined;
    status.contextParams = undefined;
    status.subreason = undefined;
    status.recoverable = true;
    if (Array.isArray(status.messages)) {
      status.messages.length = 0;
    }
  }

  function scrubEnforcementFields(entity) {
    if (!isObject(entity)) {
      return;
    }

    // Clear account-level enforcement markers
    ACCOUNT_ENFORCEMENT_KEYS.forEach((key) => {
      if (key in entity) {
        if (typeof entity[key] === "boolean") {
          entity[key] = false;
        } else if (typeof entity[key] === "number") {
          entity[key] = 0;
        } else {
          delete entity[key];
        }
      }
    });

    const status = entity.playabilityStatus;
    if (shouldNeutralizePlayability(status)) {
      neutralizePlayability(status);
      if (isObject(entity.errorScreen)) {
        delete entity.errorScreen;
      }
    }
    if (
      isObject(entity.playerResponse) &&
      shouldNeutralizePlayability(entity.playerResponse.playabilityStatus)
    ) {
      neutralizePlayability(entity.playerResponse.playabilityStatus);
      delete entity.playerResponse.errorScreen;
    }

    // Scrub account data if present
    if (isObject(entity.accountData)) {
      ACCOUNT_ENFORCEMENT_KEYS.forEach((key) => {
        if (key in entity.accountData) {
          delete entity.accountData[key];
        }
      });
    }

    // Scrub user features
    if (isObject(entity.userFeatures)) {
      ACCOUNT_ENFORCEMENT_KEYS.forEach((key) => {
        if (key in entity.userFeatures) {
          entity.userFeatures[key] = false;
        }
      });
    }
  }

  function sanitizeRecursive(entity, seen) {
    if (!isObject(entity)) {
      return entity;
    }

    if (seen.has(entity)) {
      return entity;
    }

    seen.add(entity);
    scrubEnforcementFields(entity);

    if (Array.isArray(entity)) {
      for (let i = entity.length - 1; i >= 0; i -= 1) {
        const candidate = entity[i];
        if (looksPromotedNode(candidate) || looksEnforcementNode(candidate)) {
          entity.splice(i, 1);
          continue;
        }
        sanitizeRecursive(candidate, seen);
      }
      return entity;
    }

    Object.keys(entity).forEach((key) => {
      const value = entity[key];
      if (shouldBlankKey(key)) {
        blankValue(value);
        delete entity[key];
        return;
      }
      if (ENFORCEMENT_RENDERER_KEYS.has(key)) {
        blankValue(value);
        delete entity[key];
        return;
      }
      if (ACCOUNT_ENFORCEMENT_KEYS.has(key)) {
        if (typeof value === "boolean") {
          entity[key] = false;
        } else if (typeof value === "number") {
          entity[key] = 0;
        } else {
          delete entity[key];
        }
        return;
      }
      if (key === "playabilityStatus" && shouldNeutralizePlayability(value)) {
        neutralizePlayability(value);
        delete entity.errorScreen;
        return;
      }
      if (key === "playerResponse" || key === "response") {
        scrubEnforcementFields(value);
      }
      sanitizeRecursive(value, seen);
    });

    return entity;
  }

  function sanitize(entity) {
    return sanitizeRecursive(entity, new WeakSet());
  }

  function patchGlobal(name) {
    let internal = window[name];
    Object.defineProperty(window, name, {
      configurable: true,
      enumerable: true,
      get() {
        return internal;
      },
      set(value) {
        internal = sanitize(value);
      }
    });
    internal = sanitize(internal);
  }

  /**
   * Check if an object looks like a comment/engagement response that should NOT be sanitized aggressively
   */
  function looksLikeCommentData(obj) {
    if (!isObject(obj)) {
      return false;
    }
    const keys = Object.keys(obj);
    // Common keys in comment responses
    const commentIndicators = [
      "commentThreadRenderer",
      "commentRenderer",
      "commentsHeaderRenderer",
      "commentSectionRenderer",
      "engagementPanelSectionListRenderer",
      "liveChatRenderer",
      "commentRepliesRenderer"
    ];
    return keys.some((key) => commentIndicators.includes(key));
  }

  /**
   * Lightweight sanitize that only removes obvious ad keys, preserves comment data
   */
  function sanitizeLight(entity, seen = new WeakSet()) {
    if (!isObject(entity) || seen.has(entity)) {
      return entity;
    }
    seen.add(entity);

    // Only remove HARD_BLOCK_KEYS (definitely ad-related)
    if (Array.isArray(entity)) {
      return entity;
    }

    Object.keys(entity).forEach((key) => {
      if (HARD_BLOCK_KEYS.has(key)) {
        delete entity[key];
      } else if (isObject(entity[key])) {
        sanitizeLight(entity[key], seen);
      }
    });
    return entity;
  }

  // Keys present only in YouTube API responses — used as a fast-path signal
  // to skip the expensive sanitizer on unrelated JSON objects (analytics events,
  // config blobs, localStorage values, etc.) that YouTube also parses.
  const YOUTUBE_API_SIGNALS = new Set([
    "responseContext",
    "playabilityStatus",
    "streamingData",
    "playerAds",
    "adPlacements",
    "playerResponse",
    "contents",
    "adSlots",
    "engagementPanels",
    "frameworkUpdates",
    "currentVideoEndpoint",
    "playerOverlays",
    "watchNextResults",
    "microformat",
    "header",
    "sidebar",
    "ytInitialData",
    "ytInitialPlayerResponse"
  ]);

  function mightBeYouTubeApiResponse(obj) {
    if (Array.isArray(obj)) return false;
    const keys = Object.keys(obj);
    return keys.some(
      (k) =>
        YOUTUBE_API_SIGNALS.has(k) ||
        HARD_BLOCK_KEYS.has(k) ||
        ENFORCEMENT_RENDERER_KEYS.has(k)
    );
  }

  function patchJSONParse() {
    const originalParse = JSON.parse;
    JSON.parse = function patchedJSONParse(...args) {
      const parsed = originalParse.apply(this, args);
      // Skip sanitization for non-objects (strings, numbers, booleans, null)
      if (!isObject(parsed)) {
        return parsed;
      }
      // Fast-path: skip expensive sanitization for objects that have no
      // YouTube API signals at the top level (e.g. analytics blobs, config).
      if (!mightBeYouTubeApiResponse(parsed) && !looksLikeCommentData(parsed)) {
        return parsed;
      }
      // If this looks like comment data, use light sanitization to preserve it
      if (looksLikeCommentData(parsed)) {
        return sanitizeLight(parsed);
      }
      return sanitize(parsed);
    };
    nativefy(JSON.parse, originalParse);
  }

  function patchResponseJson() {
    if (typeof Response === "undefined") {
      return;
    }
    const original = Response.prototype.json;
    Response.prototype.json = function patchedJson(...args) {
      return original.apply(this, args).then((payload) => {
        // Skip sanitization for non-objects
        if (!isObject(payload)) {
          return payload;
        }
        // If this looks like comment data, use light sanitization
        if (looksLikeCommentData(payload)) {
          return sanitizeLight(payload);
        }
        return sanitize(payload);
      });
    };
    nativefy(Response.prototype.json, original);
  }

  function patchXHR() {
    if (typeof XMLHttpRequest === "undefined") {
      return;
    }

    const originalOpen = XMLHttpRequest.prototype.open;
    const sanitizedResponses = new WeakMap();

    XMLHttpRequest.prototype.open = function patchedOpen(method, url, ...rest) {
      const blockedUrl = getBlockedUrl(url);
      if (blockedUrl) {
        notifyBlocked("xhr", blockedUrl);
      }
      this.addEventListener("readystatechange", () => {
        if (
          this.readyState === 4 &&
          this.responseType === "json" &&
          this.response
        ) {
          if (!sanitizedResponses.has(this)) {
            sanitize(this.response);
            sanitizedResponses.set(this, true);
          }
        }
      });
      return originalOpen.call(this, method, url, ...rest);
    };
    nativefy(XMLHttpRequest.prototype.open, originalOpen);
  }

  // Premium upsell panel IDs to block
  const PREMIUM_PANEL_IDS = [
    "PApremium_upsell",
    "premium_upsell",
    "premium-upsell",
    "GetPremiumPanel",
    "SPunlimited",
    "premium_unlimited"
  ];

  // Premium upsell text patterns to detect in responses
  const PREMIUM_UPSELL_PATTERNS = [
    /enjoy\s+enhanced\s+quality\s+with\s+premium/i,
    /premium.*trial.*for/i,
    /ad-free\s+youtube/i,
    /download\s+videos\s+to\s+watch/i,
    /play\s+videos\s+in\s+the\s+background/i,
    /youtube\s+music\s+premium/i,
    /iqd\s*0/i,
    /month.*trial.*cancel/i,
    /cancel\s+anytime/i,
    /get\s+youtube\s+premium/i,
    /try\s+youtube\s+premium/i,
    /start\s+free\s+trial/i
  ];

  // Check if request body contains premium upsell panel
  async function isPremiumUpsellRequest(init) {
    if (!init?.body) return false;
    try {
      let bodyStr = "";

      if (typeof init.body === "string") {
        bodyStr = init.body;
      } else if (init.body instanceof ArrayBuffer) {
        bodyStr = new TextDecoder().decode(init.body);
      } else if (init.body instanceof Uint8Array) {
        bodyStr = new TextDecoder().decode(init.body);
      } else if (typeof init.body?.text === "function") {
        bodyStr = await init.body.text();
      }

      if (!bodyStr) return false;

      // Check for premium panel IDs in the body
      const lowerBody = bodyStr.toLowerCase();
      if (
        PREMIUM_PANEL_IDS.some((id) => lowerBody.includes(id.toLowerCase()))
      ) {
        return true;
      }

      // Also check for upsell-related params
      if (lowerBody.includes("upsell") || lowerBody.includes("unlimited")) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  // Check if response data contains premium upsell content
  function containsPremiumUpsell(data) {
    if (!isObject(data)) return false;

    try {
      // Check for specific upsell structures first (cheap checks)
      if (data.content?.dialogViewModel?.customContent?.upsellViewModel) {
        return true;
      }
      if (data.content?.upsellViewModel) {
        return true;
      }
      if (data.dialogViewModel?.customContent?.upsellViewModel) {
        return true;
      }
      if (data.upsellDialogRenderer || data.premiumUpsellRenderer) {
        return true;
      }

      // Only stringify as a last resort, and limit depth to avoid performance hit
      const jsonStr = JSON.stringify(data).slice(0, 5000);

      // Check for upsell patterns in the JSON
      if (PREMIUM_UPSELL_PATTERNS.some((pattern) => pattern.test(jsonStr))) {
        return true;
      }

      // Check for tracking params that indicate premium upsell
      if (
        jsonStr.includes("GetPremiumPanel") ||
        jsonStr.includes("premium_upsell")
      ) {
        return true;
      }
    } catch {
      // Ignore errors
    }

    return false;
  }

  // Sanitize premium upsell content from responses
  function sanitizePremiumUpsell(data) {
    if (!isObject(data)) return data;

    try {
      // Remove only clearly upsell-specific keys.
      // Generic component names like dialogViewModel, buttonViewModel, panelFooterViewModel,
      // and customContent are used throughout YouTube's player UI — removing them crashes
      // quality dialogs, like buttons, and player controls.
      const upsellKeys = [
        "upsellViewModel",
        "premiumUpsellRenderer",
        "premiumUpsellDialogRenderer",
        "upsellDialogRenderer"
      ];

      upsellKeys.forEach((key) => {
        if (data[key]) {
          delete data[key];
        }
        if (data.content?.[key]) {
          delete data.content[key];
        }
      });

      // Clear content if it only contains upsell
      if (data.content && Object.keys(data.content).length === 0) {
        data.content = {};
      }

      // Return empty response structure for upsell panels
      if (containsPremiumUpsell(data)) {
        return { responseContext: data.responseContext || {}, content: {} };
      }
    } catch (error) {
      // Ignore sanitization errors
    }

    return data;
  }

  function patchFetch() {
    if (typeof window.fetch !== "function") {
      return;
    }

    // Some isolated/sandboxed frames expose a non-writable, non-configurable fetch.
    // Don't attempt to patch in that case (it can trigger errors in other scripts).
    const fetchDescriptor = Object.getOwnPropertyDescriptor(window, "fetch");
    if (
      fetchDescriptor &&
      fetchDescriptor.writable === false &&
      fetchDescriptor.configurable === false
    ) {
      return;
    }

    try {
      const nativeFetch = window.fetch.bind(window);

      // Try to override directly first
      try {
        window.fetch = async function patchedFetch(input, init) {
          const blockedUrl = getBlockedUrl(input);
          if (blockedUrl) {
            notifyBlocked("fetch", blockedUrl);
            return new Response(null, { status: 204, statusText: "Blocked" });
          }

          const url = normalizeUrlCandidate(input);

          // Block premium upsell panel requests by checking request body
          if (url && url.includes("get_panel")) {
            // Check request body for premium upsell (now async)
            const isUpsell = await isPremiumUpsellRequest(init);
            if (isUpsell) {
              notifyBlocked("fetch", url + " (premium upsell blocked)");
              return new Response('{"responseContext":{},"content":{}}', {
                status: 200,
                statusText: "OK",
                headers: { "Content-Type": "application/json" }
              });
            }

            // Always intercept and sanitize get_panel responses
            const { input: spoofedInput, init: spoofedInit } =
              applyLoggedOutSpoof(input, init);
            const res = await nativeFetch(spoofedInput, spoofedInit);

            if (
              !res.ok ||
              !res.headers.get("content-type")?.includes("application/json")
            ) {
              return res;
            }

            try {
              const text = await res.text();
              const data = JSON.parse(text);

              // Check if response contains premium upsell content
              if (containsPremiumUpsell(data)) {
                notifyBlocked(
                  "fetch",
                  url + " (premium upsell response blocked)"
                );
                const sanitized = sanitizePremiumUpsell(data);
                return new Response(JSON.stringify(sanitized), {
                  status: res.status,
                  statusText: res.statusText,
                  headers: res.headers
                });
              }

              return new Response(text, {
                status: res.status,
                statusText: res.statusText,
                headers: res.headers
              });
            } catch (error) {
              return res;
            }
          }

          const { input: spoofedInput, init: spoofedInit } =
            applyLoggedOutSpoof(input, init);
          const response = await nativeFetch(spoofedInput, spoofedInit);

          // Enhance video quality in player responses
          if (
            url &&
            (/\/youtubei\/v\d+\/player/i.test(url) ||
              url.includes("player_response"))
          ) {
            if (
              !response.ok ||
              !response.headers
                .get("content-type")
                ?.includes("application/json")
            ) {
              return response;
            }

            try {
              const text = await response.text();
              const data = JSON.parse(text);
              enhanceVideoQuality(data);

              return new Response(JSON.stringify(data), {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers
              });
            } catch (error) {
              return response;
            }
          }

          return response;
        };
        nativefy(window.fetch, nativeFetch);
        return; // Success
      } catch (directError) {
        // Property is read-only, try defineProperty
      }

      // Fallback: use defineProperty to force override
      Object.defineProperty(window, "fetch", {
        configurable: true,
        enumerable: true,
        writable: true,
        value: async function patchedFetch(input, init) {
          const blockedUrl = getBlockedUrl(input);
          if (blockedUrl) {
            notifyBlocked("fetch", blockedUrl);
            return new Response(null, { status: 204, statusText: "Blocked" });
          }

          const url = normalizeUrlCandidate(input);

          // Block premium upsell panel requests by checking request body
          if (url && url.includes("get_panel")) {
            // Check request body for premium upsell (now async)
            const isUpsell = await isPremiumUpsellRequest(init);
            if (isUpsell) {
              notifyBlocked("fetch", url + " (premium upsell blocked)");
              return new Response('{"responseContext":{},"content":{}}', {
                status: 200,
                statusText: "OK",
                headers: { "Content-Type": "application/json" }
              });
            }

            // Always intercept and sanitize get_panel responses
            const { input: spoofedInput, init: spoofedInit } =
              applyLoggedOutSpoof(input, init);
            const res = await nativeFetch(spoofedInput, spoofedInit);

            if (
              !res.ok ||
              !res.headers.get("content-type")?.includes("application/json")
            ) {
              return res;
            }

            try {
              const text = await res.text();
              const data = JSON.parse(text);

              // Check if response contains premium upsell content
              if (containsPremiumUpsell(data)) {
                notifyBlocked(
                  "fetch",
                  url + " (premium upsell response blocked)"
                );
                const sanitized = sanitizePremiumUpsell(data);
                return new Response(JSON.stringify(sanitized), {
                  status: res.status,
                  statusText: res.statusText,
                  headers: res.headers
                });
              }

              return new Response(text, {
                status: res.status,
                statusText: res.statusText,
                headers: res.headers
              });
            } catch (error) {
              return res;
            }
          }

          const { input: spoofedInput, init: spoofedInit } =
            applyLoggedOutSpoof(input, init);
          const response = await nativeFetch(spoofedInput, spoofedInit);

          // Enhance video quality in player responses
          if (
            url &&
            (/\/youtubei\/v\d+\/player/i.test(url) ||
              url.includes("player_response"))
          ) {
            if (
              !response.ok ||
              !response.headers
                .get("content-type")
                ?.includes("application/json")
            ) {
              return response;
            }

            try {
              const text = await response.text();
              const data = JSON.parse(text);
              enhanceVideoQuality(data);

              return new Response(JSON.stringify(data), {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers
              });
            } catch (error) {
              return response;
            }
          }

          return response;
        }
      });
      nativefy(window.fetch, nativeFetch);
    } catch (error) {
      console.warn("[CTF-Blocker] Could not patch fetch:", error);
    }
  }

  function patchSendBeacon() {
    if (!navigator?.sendBeacon) {
      return;
    }
    const nativeBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function patchedBeacon(resource, data) {
      const blockedUrl = getBlockedUrl(resource);
      if (blockedUrl) {
        notifyBlocked("beacon", blockedUrl);
        return true;
      }
      return nativeBeacon(resource, data);
    };
    nativefy(navigator.sendBeacon, nativeBeacon);
  }

  function disableEnforcementFlags(flags) {
    if (!isObject(flags)) {
      return flags;
    }
    ENFORCEMENT_FLAG_KEYS.forEach((key) => {
      if (key in flags) {
        flags[key] = false;
      }
    });
    return flags;
  }

  function scrubFflagsString(input) {
    if (typeof input !== "string" || input.indexOf("=") === -1) {
      return input;
    }
    const segments = input.split("&");
    let mutated = false;
    const rewritten = segments.map((segment) => {
      if (!segment) {
        return segment;
      }
      const [rawKey, rawValue = ""] = segment.split("=");
      if (!rawKey) {
        return segment;
      }
      if (ENFORCEMENT_FLAG_KEYS.includes(rawKey)) {
        mutated = true;
        return `${rawKey}=false`;
      }
      return `${rawKey}=${rawValue}`;
    });
    return mutated ? rewritten.join("&") : input;
  }

  function scrubPlayerResponseString(payload) {
    if (typeof payload !== "string" || !payload.trim()) {
      return payload;
    }
    try {
      const parsed = JSON.parse(payload);
      sanitize(parsed);
      return JSON.stringify(parsed);
    } catch (error) {
      return payload;
    }
  }

  function scrubPlayerArgs(args) {
    if (!isObject(args)) {
      return;
    }
    if (typeof args.player_response === "string") {
      args.player_response = scrubPlayerResponseString(args.player_response);
    } else if (isObject(args.player_response)) {
      sanitize(args.player_response);
    }
    if (typeof args.raw_player_response === "string") {
      args.raw_player_response = scrubPlayerResponseString(
        args.raw_player_response
      );
    } else if (isObject(args.raw_player_response)) {
      sanitize(args.raw_player_response);
    }
    if (typeof args.playerResponse === "string") {
      args.playerResponse = scrubPlayerResponseString(args.playerResponse);
    } else if (isObject(args.playerResponse)) {
      sanitize(args.playerResponse);
    }
    if (typeof args.fflags === "string") {
      args.fflags = scrubFflagsString(args.fflags);
    }
    if (isObject(args.EXPERIMENT_FLAGS)) {
      disableEnforcementFlags(args.EXPERIMENT_FLAGS);
    }
  }

  function sanitizeYtPlayer(player) {
    if (!isObject(player)) {
      return player;
    }
    if (isObject(player.config)) {
      scrubPlayerArgs(player.config.args);
    }
    return player;
  }

  function patchYtcfg() {
    const applyPatch = (cfg) => {
      if (!cfg || cfg.__ctfPatched) {
        return cfg?.__ctfPatched ?? false;
      }
      disableEnforcementFlags(cfg.data_?.EXPERIMENT_FLAGS);

      // Capture originals so we can selectively spoof on network calls later
      if (cfg.data_) {
        if (!window.__ctfOriginalYtcfg) {
          window.__ctfOriginalYtcfg = {
            loggedIn: cfg.data_.LOGGED_IN,
            sessionIndex: cfg.data_.SESSION_INDEX,
            delegatedSessionId: cfg.data_.DELEGATED_SESSION_ID,
            visitorData: cfg.data_.VISITOR_DATA
          };
        }

        // Keep premium flags to prevent ads and enable premium features
        cfg.data_.PREMIUM_SUBSCRIPTION = true;
        cfg.data_.PREMIUM_ADS_DISABLED = true;
        cfg.data_.PREMIUM_QUALITY_ENABLED = true;
        cfg.data_.PREMIUM_1080P60_ENABLED = true;
        cfg.data_.ACCOUNT_FEATURES = cfg.data_.ACCOUNT_FEATURES || [];
        const premiumFeatures = [
          "adsfree",
          "premium_quality",
          "1080p60",
          "enhanced_bitrate",
          "premium_streaming"
        ];
        premiumFeatures.forEach((feature) => {
          if (!cfg.data_.ACCOUNT_FEATURES.includes(feature)) {
            cfg.data_.ACCOUNT_FEATURES.push(feature);
          }
        });
      }

      if (typeof cfg.get === "function") {
        const originalGet = cfg.get;
        cfg.get = function patchedGet(key, defaultValue) {
          const value = originalGet.call(this, key, defaultValue);
          if (key === "EXPERIMENT_FLAGS") {
            disableEnforcementFlags(value);
          }
          // Report as premium user (keeps ads away and enables premium features)
          if (key === "PREMIUM_SUBSCRIPTION") {
            return true;
          }
          if (key === "PREMIUM_ADS_DISABLED") {
            return true;
          }
          if (key === "PREMIUM_QUALITY_ENABLED") {
            return true;
          }
          if (key === "PREMIUM_1080P60_ENABLED") {
            return true;
          }
          return value;
        };
      }
      if (typeof cfg.set === "function") {
        const originalSet = cfg.set;
        cfg.set = function patchedSet(key, value) {
          if (key === "EXPERIMENT_FLAGS") {
            disableEnforcementFlags(value);
          }
          // Block attempts to set ad-block detection flags
          if (ACCOUNT_ENFORCEMENT_KEYS.has(key)) {
            return;
          }
          return originalSet.apply(this, arguments);
        };
      }
      cfg.__ctfPatched = true;
      return true;
    };

    if (applyPatch(window.ytcfg)) {
      return;
    }

    const intervalId = setInterval(() => {
      if (applyPatch(window.ytcfg)) {
        clearInterval(intervalId);
      }
    }, 50);
  }

  function guardYtAdsObject(target) {
    if (!isObject(target)) {
      return;
    }
    try {
      Object.defineProperty(target, "adBlocked", {
        configurable: true,
        enumerable: true,
        get() {
          return false;
        },
        set() {}
      });
    } catch (error) {
      // best effort
    }
  }

  function spoofAdDetectionGlobals() {
    guardYtAdsObject(window.ytads);
    Object.defineProperty(window, "ytads", {
      configurable: true,
      get() {
        const store = window.__ctfYtAds || {};
        guardYtAdsObject(store);
        window.__ctfYtAds = store;
        return store;
      },
      set(value) {
        guardYtAdsObject(value);
        window.__ctfYtAds = value;
      }
    });

    if (!window.googletag) {
      const placeholder = {
        cmd: [],
        pubads() {
          return {
            addEventListener() {},
            enableSingleRequest() {},
            disableInitialLoad() {},
            collapseEmptyDivs() {}
          };
        },
        enableServices() {}
      };
      window.googletag = placeholder;
    }
  }

  function spoofGoogleAdStatus() {
    try {
      Object.defineProperty(window, "google_ad_status", {
        configurable: true,
        enumerable: true,
        get() {
          return 0;
        },
        set() {}
      });
    } catch (error) {
      window.google_ad_status = 0;
    }

    const tagInfo = window.google_tag_info || {};
    tagInfo.apiVersion = tagInfo.apiVersion || "1";
    tagInfo.adCount = 0;
    tagInfo.adSlotIdMap = tagInfo.adSlotIdMap || {};
    tagInfo.initialized = true;
    tagInfo.saveAdBlockingRecoveryTag = () => {};
    tagInfo.used = true;
    tagInfo.disablePublisherConsole = true;
    window.google_tag_info = tagInfo;
  }

  function patchYtPlayer() {
    const applyArgsPatch = (config) => {
      if (!isObject(config) || config.__ctfPatched) {
        return;
      }
      config.__ctfPatched = true;
      const args = config.args;
      scrubPlayerArgs(args);
      if (isObject(args)) {
        const responseKeys = [
          "player_response",
          "raw_player_response",
          "playerResponse"
        ];
        responseKeys.forEach((key) => {
          if (!(key in args)) {
            return;
          }
          let store = args[key];
          if (typeof store === "string") {
            store = scrubPlayerResponseString(store);
          } else if (isObject(store)) {
            sanitize(store);
          }
          Object.defineProperty(args, key, {
            configurable: true,
            enumerable: true,
            get() {
              return store;
            },
            set(value) {
              if (typeof value === "string") {
                store = scrubPlayerResponseString(value);
              } else if (isObject(value)) {
                sanitize(value);
                store = value;
              } else {
                store = value;
              }
            }
          });
        });
        if ("fflags" in args) {
          let flagStore = scrubFflagsString(args.fflags);
          Object.defineProperty(args, "fflags", {
            configurable: true,
            enumerable: true,
            get() {
              return flagStore;
            },
            set(value) {
              flagStore =
                typeof value === "string" ? scrubFflagsString(value) : value;
            }
          });
        }
        if ("EXPERIMENT_FLAGS" in args) {
          let experimentStore = disableEnforcementFlags(args.EXPERIMENT_FLAGS);
          Object.defineProperty(args, "EXPERIMENT_FLAGS", {
            configurable: true,
            enumerable: true,
            get() {
              return experimentStore;
            },
            set(value) {
              experimentStore = disableEnforcementFlags(value);
            }
          });
        }
      }
    };

    const attemptConfigPatch = () => {
      const candidate = window.ytplayer?.config;
      if (isObject(candidate)) {
        applyArgsPatch(candidate);
        return true;
      }
      return false;
    };

    let internal = sanitizeYtPlayer(window.ytplayer);
    try {
      Object.defineProperty(window, "ytplayer", {
        configurable: true,
        enumerable: true,
        get() {
          return internal;
        },
        set(value) {
          internal = sanitizeYtPlayer(value);
          attemptConfigPatch();
        }
      });
    } catch (error) {
      internal = window.ytplayer = sanitizeYtPlayer(window.ytplayer);
    }

    if (!attemptConfigPatch()) {
      const intervalId = setInterval(() => {
        if (attemptConfigPatch()) {
          clearInterval(intervalId);
        }
      }, 50);
    }
  }

  // Repair helper: if ytInitialPlayerResponse is missing, try to recover it from ytplayer config.
  function ensurePlayerResponse() {
    try {
      if (window.ytInitialPlayerResponse?.playabilityStatus) {
        return;
      }

      const args = window.ytplayer?.config?.args;
      if (!args) {
        return;
      }

      const candidate = args.player_response || args.raw_player_response;
      if (!candidate) {
        return;
      }

      const parsed =
        typeof candidate === "string" ? JSON.parse(candidate) : candidate;
      if (parsed?.playabilityStatus) {
        window.ytInitialPlayerResponse = parsed;
      }
    } catch (error) {
      // Ignore parse/shape errors; avoid injecting a fake response.
    }
  }

  patchGlobal("ytInitialPlayerResponse");
  patchGlobal("ytInitialData");
  patchJSONParse();
  patchResponseJson();
  patchXHR();
  patchFetch();
  patchSendBeacon();
  patchYtcfg();
  spoofAdDetectionGlobals();
  spoofGoogleAdStatus();
  patchYtPlayer();

  // Attempt recovery after ytplayer config has had a chance to initialize.
  setTimeout(ensurePlayerResponse, 500);
  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      () => setTimeout(ensurePlayerResponse, 500),
      { once: true }
    );
  }
})();
