// Classic content script: shares the isolated-world scope with contentScript.js.
let premiumStyleInjected = false;

function injectPremiumStyles() {
  if (premiumStyleInjected) {
    return;
  }
  const style = document.createElement("style");
  style.id = "ctf-premium-style";
  style.textContent = `
    /* ===== SUPER VOLUME SLIDER (500% BOOST) - REFINED UI/UX ===== */
    .ctf-volume-boost-slider {
      position: relative !important;
      width: 100px !important;
      min-width: 100px !important;
      height: 6px !important;
      background: rgba(255, 255, 255, 0.2) !important;
      border-radius: 3px !important;
      overflow: visible !important;
      margin: 0 10px !important;
      cursor: pointer !important;
      transition: height 0.1s ease;
      border: none !important;
    }

    /* Expand height on hover for better interaction target */
    .ctf-volume-boost-slider:hover {
      height: 8px !important;
    }

    /* The colored fill bar */
    .ctf-volume-boost-slider::before {
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      width: 100%;
      background: linear-gradient(90deg,
        var(--ipt-accent, #ffffff) 0%,
        var(--ipt-accent, #ffffff) 40%,
        var(--ipt-secondary, #ffffff) 100%
      );
      opacity: 1;
      transform-origin: left center;
      transform: scaleX(var(--ctf-volume-ratio, 0));
      border-radius: 3px;
      pointer-events: none;
      box-shadow: 0 0 8px rgba(0, 207, 255, 0.4);
    }

    /* Percentage tooltip - only shows on hover/drag */
    .ctf-volume-boost-slider[data-ctf-volume]::after {
      content: attr(data-ctf-volume) "%";
      position: absolute;
      top: -32px;
      left: 50%;
      transform: translateX(-50%) scale(0.8);
      background: rgba(28, 28, 28, 0.9);
      color: #fff;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      font-family: "Roboto", sans-serif;
      opacity: 0;
      transition: opacity 0.2s ease, transform 0.2s ease;
      pointer-events: none;
      white-space: nowrap;
      box-shadow: 0 2px 8px rgba(0,0,0,0.5);
      border: 1px solid rgba(255,255,255,0.1);
    }

    /* Show tooltip when hovering slider or when dragging (active) */
    .ctf-volume-boost-slider:hover::after,
    .ctf-volume-boost-slider:active::after {
      opacity: 1;
      transform: translateX(-50%) scale(1);
    }

    /* The circular handle - HIDDEN per user request */
    .ctf-volume-boost-slider .ytp-volume-slider-handle {
      display: none !important;
    }

    /* Handle hover effect - REMOVED */
    .ctf-volume-boost-slider:hover .ytp-volume-slider-handle {
      display: none !important;
    }

    /* Volume markers for 100%, 200%, etc */
    .ctf-volume-boost-slider .ytp-volume-slider {
      position: relative;
    }

    ytd-compact-video-renderer[data-ctf-curated="true"] {
      border: 1px solid rgba(249,212,35,0.4);
      border-radius: 12px;
      padding: 6px;
      background: rgba(5,5,5,0.35);
    }

    #ctf-curated-sidebar-label {
      font-size: 13px;
      font-weight: 600;
      color: #f9d423;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }

    /* ===== 4-ROW GRID LAYOUT FOR HOME PAGE ===== */
    ytd-rich-grid-renderer {
      --ytd-rich-grid-items-per-row: 4 !important;
      --ytd-rich-grid-posts-per-row: 4 !important;
      --ytd-rich-grid-movies-per-row: 4 !important;
      --ytd-rich-grid-game-cards-per-row: 4 !important;
    }

    ytd-rich-grid-renderer #contents.ytd-rich-grid-renderer {
      display: grid !important;
      grid-template-columns: repeat(4, 1fr) !important;
      gap: 16px !important;
      grid-auto-flow: row !important;
    }

    /* Force all rich items to respect grid sizing */
    ytd-rich-item-renderer[rendered-from-rich-grid] {
      width: 100% !important;
      max-width: 100% !important;
      min-width: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      box-sizing: border-box !important;
      grid-column: span 1 !important;
    }

    ytd-rich-item-renderer[rendered-from-rich-grid] #content {
      width: 100% !important;
      max-width: 100% !important;
      min-width: 0 !important;
    }

    /* Force all media containers to 100% width */
    ytd-rich-item-renderer[rendered-from-rich-grid] ytd-thumbnail,
    ytd-rich-item-renderer[rendered-from-rich-grid] ytd-rich-grid-media,
    ytd-rich-item-renderer[rendered-from-rich-grid] ytd-rich-grid-slim-media,
    ytd-rich-item-renderer[rendered-from-rich-grid] ytd-video-renderer,
    ytd-rich-item-renderer[rendered-from-rich-grid] ytd-grid-video-renderer,
    ytd-rich-item-renderer[rendered-from-rich-grid] ytd-playlist-renderer,
    ytd-rich-item-renderer[rendered-from-rich-grid] ytd-rich-grid-playlist-renderer,
    ytd-rich-item-renderer[rendered-from-rich-grid] yt-lockup-view-model,
    ytd-rich-item-renderer[rendered-from-rich-grid] yt-image {
      width: 100% !important;
      max-width: 100% !important;
      min-width: 0 !important;
    }

    ytd-rich-item-renderer[rendered-from-rich-grid] ytd-thumbnail a,
    ytd-rich-item-renderer[rendered-from-rich-grid] ytd-thumbnail #thumbnail,
    ytd-rich-item-renderer[rendered-from-rich-grid] ytd-thumbnail img,
    ytd-rich-item-renderer[rendered-from-rich-grid] yt-image img {
      width: 100% !important;
      max-width: 100% !important;
      height: auto !important;
    }

    ytd-rich-grid-row {
      display: contents !important;
    }

    /* ===== CONSTRAIN RICH SECTION RENDERERS (MIXES, PROMOTIONS) ===== */
    ytd-rich-section-renderer {
      width: 100% !important;
      max-width: 100% !important;
      grid-column: span 4 !important;
    }

    /* Ensure any content within sections also respects grid */
    ytd-rich-section-renderer ytd-rich-item-renderer {
      width: calc(25% - 12px) !important;
      max-width: calc(25% - 12px) !important;
      min-width: 0 !important;
      display: inline-block !important;
      vertical-align: top !important;
      margin: 0 16px 16px 0 !important;
    }

    ytd-rich-section-renderer ytd-rich-item-renderer:nth-child(4n) {
      margin-right: 0 !important;
    }

    /* ===== REMOVE EMPTY SPACE / GAPS ===== */
    ytd-rich-grid-renderer #contents.ytd-rich-grid-renderer > ytd-rich-item-renderer:empty,
    ytd-rich-grid-renderer #contents.ytd-rich-grid-renderer > ytd-rich-section-renderer:empty {
      display: none !important;
    }

    ytd-two-column-browse-results-renderer {
      padding: 0 24px !important;
    }

    #primary.ytd-two-column-browse-results-renderer {
      padding-top: 24px !important;
    }

    ytd-rich-grid-renderer {
      margin: 0 !important;
      padding: 0 !important;
    }

    /* ===== VOLUME PANEL SIZE FOR 500% SUPER VOLUME ===== */
    .ytp-volume-panel {
      width: auto !important;
      min-width: 150px !important;
      display: flex !important;
      align-items: center !important;
      transition: width 0.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s !important;
      overflow: visible !important;
    }

    /* Ensure the native slider container matches our custom slider */
    .ytp-volume-slider {
      width: 100px !important;
      z-index: 500 !important;
      overflow: visible !important;
    }

    .ytp-volume-control-hover .ytp-volume-panel {
      width: auto !important;
      min-width: 150px !important;
    }

    /* Ensure panel stays open when interacting */
    .ytp-volume-area:hover .ytp-volume-panel,
    .ytp-volume-panel:hover {
      width: auto !important;
      min-width: 150px !important;
      opacity: 1 !important;
    }

    /* ===== HIDE END SCREEN OVERLAYS ===== */
    /* Hide video end cards/recommendations that cover the video */
    .ytp-ce-element,
    .ytp-ce-covering-overlay,
    .ytp-ce-element-show,
    .ytp-ce-channel,
    .ytp-ce-video,
    .ytp-ce-playlist,
    .ytp-ce-website-group,
    .ytp-endscreen-content,
    .ytp-ce-expanding-overlay,
    .ytp-ce-expanding-image,
    .ytp-ce-shadow,
    .html5-endscreen,
    .videowall-endscreen {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }

    /* Also hide the endscreen container */
    .ytp-endscreen-previous,
    .ytp-endscreen-next,
    .ytp-show-tiles .ytp-videowall-still {
      display: none !important;
    }

    /* ===== HIDE RIGHT-SIDE COMMENTS PANEL ===== */
    /* Only show comments below the player, not in the right sidebar */
    ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-comments-section"] {
      display: none !important;
      visibility: hidden !important;
    }

    /* ===== HIDE PREMIUM UPSELLS AND ENHANCEMENT NOTIFICATIONS ===== */
    ytd-premium-upsell-renderer,
    ytd-premium-upsell-dialog-renderer,
    .premium-yoodle,
    .ytd-premium-subscription-offer-renderer,
    tp-yt-paper-dialog[aria-label*="Premium"],
    tp-yt-paper-dialog[aria-label*="premium"],
    tp-yt-paper-dialog[aria-label*="Enjoy enhanced quality"],
    tp-yt-paper-dialog[aria-label*="enhanced quality"],
    tp-yt-paper-dialog[aria-label*="1080p60"],
    [data-testid*="premium-upsell"],
    [data-testid*="upsell"],
    ytd-engagement-panel-section-list-renderer[target-id*="premium"] {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }

    /* Hide premium upgrade notifications */
    ytd-notification-action-renderer:has([aria-label*="Premium"]),
    ytd-notification-action-renderer:has([aria-label*="enhanced quality"]) {
      display: none !important;
    }

    /* Force enable 1080p60 in quality menu */
    .ytp-quality-menu .ytp-menuitem[aria-label*="1080p60"] {
      display: block !important;
      opacity: 1 !important;
      pointer-events: auto !important;
    }
  `;
  document.head.appendChild(style);
  premiumStyleInjected = true;
}

function applyPremiumBranding() {
  injectPremiumStyles();
  ThemeController.refreshBranding();
}
