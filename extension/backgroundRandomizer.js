(() => {
  "use strict";

  /* --- STRANGER THINGS BACKGROUND RANDOMIZER --- */

  const ST_BACKGROUNDS = [
    "background/1.svg",
    "background/2.svg",
    "background/3.svg",
    "background/4.svg",
    "background/5.svg",
    "background/6.svg",
    "background/7.svg"
  ];

  function applyRandomStrangerThingBackground() {
    try {
      const randomIndex = Math.floor(Math.random() * ST_BACKGROUNDS.length);
      const selectedImage = ST_BACKGROUNDS[randomIndex];

      // chrome.runtime.getURL is required to access the web_accessible_resources
      const imageUrl = chrome.runtime.getURL(selectedImage);

      // Set the CSS variable specifically for the body background
      document.documentElement.style.setProperty(
        "--st-bg-image",
        `url('${imageUrl}')`
      );

      console.log("[Stranger Things] Upside Down shifted to:", selectedImage);
    } catch (e) {
      console.warn("[Stranger Things] Failed to shift reality:", e);
    }
  }

  // Initialize random background
  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      applyRandomStrangerThingBackground
    );
  } else {
    applyRandomStrangerThingBackground();
  }

  function injectStrangerThingsLogo() {
    try {
      const logoRenderer = document.querySelector("ytd-topbar-logo-renderer");
      if (logoRenderer && !document.getElementById("st-custom-logo")) {
        const wrapper = document.createElement("div");
        wrapper.id = "st-custom-logo";

        const title = document.createElement("a"); // Make it a link
        title.className = "st-logo-title";
        title.innerText = "STRANGER THINGS";
        title.href = "/";
        title.style.textDecoration = "none"; // No underline

        const subtitle = document.createElement("a");
        subtitle.className = "st-logo-subtitle";
        subtitle.innerText = "Created by IP | V2.3";
        subtitle.href = "https://instagram.com/tofa";
        subtitle.target = "_blank";
        subtitle.rel = "noopener noreferrer";

        wrapper.appendChild(title);
        wrapper.appendChild(subtitle);

        logoRenderer.appendChild(wrapper);
      }
    } catch (e) {
      console.warn("[Stranger Things] Logo injection error", e);
    }
  }

  // Re-run injection periodically to handle YouTube's dynamic re-rendering.
  // Once successfully injected, the interval clears itself to avoid wasted DOM queries.
  let _logoIntervalId = setInterval(() => {
    injectStrangerThingsLogo();
    if (document.getElementById("st-custom-logo")) {
      clearInterval(_logoIntervalId);
      _logoIntervalId = null;
    }
  }, 5000);
  injectStrangerThingsLogo();

  /* --- THE VEKNA CLOCK (Easter Egg Timeline) --- */
  const TARGET_VIDEO_ID = "SkcO47UDzzY";

  // Dynamic list from "FEELING WITH IP MODE"
  let ambilightVideoIds = [...VideoSettings.DEFAULT_IDS];

  VideoSettings.load()
    .then((ids) => {
      ambilightVideoIds = ids;
    })
    .catch((error) => {
      console.warn("[Stranger Things] Could not load ambilight videos:", error);
    });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[VideoSettings.STORAGE_KEY]) {
      ambilightVideoIds = VideoSettings.normalizeIds(
        changes[VideoSettings.STORAGE_KEY].newValue
      );
    }
  });

  let currentPhase = "normal"; // normal, blackout, burning, freezing
  let ambilightActive = false;
  let ambilightCanvas, ambilightCtx, ambilightLoopId;

  function checkTimeForDoom() {
    if (!BrowserFeatures.getSettings().cinematicEffects || document.hidden) {
      if (currentPhase !== "normal") resetReality();
      if (ambilightActive) stopAmbilight();
      return;
    }
    const url = window.location.href;
    const video = document.querySelector("video");
    const player = document.getElementById("movie_player");

    // Safety: If no player, ensure everything is off
    if (!video || !player) {
      if (currentPhase !== "normal") resetReality();
      if (ambilightActive) stopAmbilight();
      return;
    }

    // Ad Detection
    const isAdPlaying =
      player.classList.contains("ad-interrupting") ||
      player.classList.contains("ad-showing");

    // 1. VEKNA LOGIC (Doom Video)
    if (VideoSettings.extractVideoId(url) === TARGET_VIDEO_ID) {
      if (ambilightActive) stopAmbilight(); // Ensure no conflict

      if (isAdPlaying) {
        if (currentPhase !== "normal") resetReality();
        return;
      }

      handleVeknaTimeline(video.currentTime);
    }
    // 2. AMBILIGHT LOGIC (Music Videos from List)
    else if (isVideoInAmbilightList(url)) {
      if (currentPhase !== "normal") resetReality(); // Ensure no conflict

      // STRICT PLAY CHECK: Stop if ad is playing OR video is paused OR video hasn't started
      if (isAdPlaying || video.paused || video.currentTime === 0) {
        if (ambilightActive) stopAmbilight();
        return;
      }

      if (!ambilightActive) startAmbilight();
    }
    // 3. NORMAL REALITY
    else {
      if (currentPhase !== "normal") resetReality();
      if (ambilightActive) stopAmbilight();
    }
  }

  function isVideoInAmbilightList(url) {
    return ambilightVideoIds.includes(VideoSettings.extractVideoId(url));
  }

  function handleVeknaTimeline(t) {
    // 0:45 - 0:46: BLACKOUT
    if (t >= 45 && t < 46) {
      setPhase("blackout");
    }
    // 0:46 - 1:07: BURNING MODE
    else if (t >= 46 && t < 67) {
      setPhase("burning");
    }
    // 1:07 - 1:46: FREEZING / COLD MODE
    else if (t >= 67 && t < 106) {
      setPhase("freezing");
    }
    // 1:46 - 1:47: BLACKOUT AGAIN
    else if (t >= 106 && t < 107) {
      setPhase("blackout");
    }
    // 1:47 - 2:18: BURNING AGAIN
    else if (t >= 107 && t < 138) {
      setPhase("burning");
    }
    // 2:18 - 2:29: INTENSE BURNING
    else if (t >= 138 && t < 149) {
      setPhase("burning-intense");
    }
    // 2:29 onwards: BACK TO FREEZING
    else if (t >= 149) {
      setPhase("freezing");
    }
    // DEFAULT: RESET
    else {
      if (currentPhase !== "normal") resetReality();
    }
  }

  function setPhase(phase) {
    if (currentPhase === phase) return;
    currentPhase = phase;
    console.log(`[Stranger Things] Phase shifted to: ${phase}`);
    document.body.classList.remove(
      "st-burning-mode",
      "st-intense",
      "st-freezing-mode"
    );
    removeOverlays();

    if (phase === "blackout") {
      const gloom = document.createElement("div");
      gloom.className = "st-special-blackout";
      document.body.appendChild(gloom);
    } else if (phase === "burning") {
      document.body.classList.add("st-burning-mode");
      addOverlay("st-burning-overlay");
      addOverlay("st-ash-overlay");
    } else if (phase === "burning-intense") {
      document.body.classList.add("st-burning-mode", "st-intense");
      addOverlay("st-burning-overlay");
      addOverlay("st-ash-overlay");
    } else if (phase === "freezing") {
      document.body.classList.add("st-freezing-mode");
      addOverlay("st-freezing-overlay");
      addOverlay("st-snow-overlay");
    }
  }

  /* --- AMBILIGHT VISUALIZER LOGIC --- */
  function startAmbilight() {
    console.log("[Stranger Things] Ambilight Active");
    ambilightActive = true;
    document.body.classList.add("st-ambilight-active");

    // Create the full-screen glow layer
    if (!document.querySelector(".st-ambilight-screen")) {
      const screen = document.createElement("div");
      screen.className = "st-ambilight-screen";
      document.body.appendChild(screen);
    }

    if (!ambilightCanvas) {
      ambilightCanvas = document.createElement("canvas");
      ambilightCanvas.width = 10;
      ambilightCanvas.height = 10;
      ambilightCtx = ambilightCanvas.getContext("2d");
    }

    let lastAmbilightTime = 0;
    const AMBILIGHT_INTERVAL = 100; // Update color every 100ms instead of every frame (60fps)

    const loop = () => {
      if (!ambilightActive) return;

      const now = performance.now();
      if (now - lastAmbilightTime >= AMBILIGHT_INTERVAL) {
        lastAmbilightTime = now;

        const video = document.querySelector("video");
        if (video && !video.paused) {
          try {
            ambilightCtx.drawImage(
              video,
              0,
              0,
              ambilightCanvas.width,
              ambilightCanvas.height
            );

            // Get dominant color
            const p = ambilightCtx.getImageData(5, 5, 1, 1).data;
            const r = p[0],
              g = p[1],
              b = p[2];

            const colorDecl = `rgb(${r}, ${g}, ${b})`;
            const glowDecl = `0 0 15px rgba(${r}, ${g}, ${b}, 0.8)`;

            // 1. Update Neon UI (Logo, Divider)
            document.documentElement.style.setProperty("--st-red", colorDecl);
            document.documentElement.style.setProperty("--st-glow", glowDecl);

            // 2. Update Fullscreen Ambient GLow
            const screen = document.querySelector(".st-ambilight-screen");
            if (screen) {
              // Using hard color but opacity handled in CSS mix-blend-mode
              screen.style.backgroundColor = colorDecl;
            }
          } catch (e) {
            // CORS silence
          }
        }
      }
      ambilightLoopId = requestAnimationFrame(loop);
    };
    loop();
  }

  function stopAmbilight() {
    console.log("[Stranger Things] Ambilight Stopped");
    ambilightActive = false;
    document.body.classList.remove("st-ambilight-active");
    if (ambilightLoopId) cancelAnimationFrame(ambilightLoopId);

    // Remove Overlay
    const screen = document.querySelector(".st-ambilight-screen");
    if (screen) screen.remove();

    // Reset Defaults
    document.documentElement.style.setProperty("--st-red", "#E71D36");
    document.documentElement.style.setProperty(
      "--st-glow",
      "0 0 10px rgba(231, 29, 54, 0.7)"
    );
  }

  function addOverlay(className) {
    if (!document.querySelector("." + className)) {
      const el = document.createElement("div");
      el.className = className;
      document.body.appendChild(el);
    }
  }

  function removeOverlays() {
    const selectors = [
      ".st-special-blackout",
      ".st-burning-overlay",
      ".st-ash-overlay",
      ".st-freezing-overlay",
      ".st-snow-overlay"
    ];
    selectors.forEach((sel) => {
      const el = document.querySelector(sel);
      if (el) el.remove();
    });
  }

  function resetReality() {
    currentPhase = "normal";
    document.body.classList.remove(
      "st-burning-mode",
      "st-intense",
      "st-freezing-mode"
    );
    removeOverlays();
  }

  // Monitor time every 500ms (reduced from 250ms - still responsive but halves CPU load)
  setInterval(checkTimeForDoom, 500);

  /* --- NAVIGATION CLEANUP & SMOOTHNESS --- */
  // Listen for YouTube's internal SPA navigation event
  document.addEventListener("yt-navigate-finish", () => {
    // 1. Immediate Cleanup: Remove heavy burning/ash effects to free memory/GPU
    resetReality();
    stopAmbilight(); // Also stop ambilight on nav

    // 2. Pick a new random background on every navigation
    applyRandomStrangerThingBackground();

    // 3. Logo Check: Ensure our custom header remains
    setTimeout(injectStrangerThingsLogo, 500);

    console.log("[Stranger Things] Navigation detected - State refreshed.");
  });
})();
