// Classic content script: shares the isolated-world scope with contentScript.js.
let superVolumePercent = SUPER_VOLUME_DEFAULT;
let superVolumePreferenceLoaded = false;
let superVolumeAudioCtx = null;
let superVolumeGainNode = null;
let superVolumeSourceMap = new WeakMap();
let superVolumeHotkeysBound = false;
let suppressNativeVolumeEvent = false;
let sliderDragActive = false;
let videoLoopEnabled = VIDEO_LOOP_DEFAULT;
let loopButtonInjected = false;
let dolbyAtmosEnabled = false;
let dolbyAtmosButtonInjected = false;
// Simple Spatial audio audio nodes (clean, no distortion)
let dolbyBassFilter = null; // Clean bass enhancement
let dolbyTrebleFilter = null; // Clean treble/presence
let dolbySpatialReverb = null; // Light 3D reverb
let dolbyStereoEnhancer = null; // Stereo width
const DOLBY_ATMOS_STORAGE_KEY = "ctf-dolby-atmos-enabled";

function ensureSuperVolumePreferenceLoaded() {
  if (superVolumePreferenceLoaded) {
    return;
  }
  superVolumePreferenceLoaded = true;
  try {
    const storedRaw = localStorage.getItem(SUPER_VOLUME_STORAGE_KEY);
    if (storedRaw !== null && storedRaw !== "") {
      const storedValue = Number(storedRaw);
      if (Number.isFinite(storedValue) && storedValue > 0) {
        superVolumePercent = clampSuperVolume(storedValue);
      } else {
        // Invalid or 0 value stored, reset to default
        superVolumePercent = SUPER_VOLUME_DEFAULT;
        persistSuperVolumePreference(SUPER_VOLUME_DEFAULT);
      }
    } else {
      // No preference stored, use default and save it
      superVolumePercent = SUPER_VOLUME_DEFAULT;
      persistSuperVolumePreference(SUPER_VOLUME_DEFAULT);
    }
  } catch (error) {
    console.debug("[CTF-Blocker] volume preference unavailable", error);
    superVolumePercent = SUPER_VOLUME_DEFAULT;
  }
}

function clampSuperVolume(value) {
  if (!Number.isFinite(value)) {
    return SUPER_VOLUME_DEFAULT;
  }
  return Math.max(SUPER_VOLUME_MIN, Math.min(SUPER_VOLUME_MAX, value));
}

function persistSuperVolumePreference(value) {
  try {
    localStorage.setItem(SUPER_VOLUME_STORAGE_KEY, String(value));
  } catch (error) {
    console.debug("[CTF-Blocker] volume preference save failed", error);
  }
}

function resumeSuperVolumeContext() {
  if (superVolumeAudioCtx && superVolumeAudioCtx.state === "suspended") {
    superVolumeAudioCtx.resume().catch(() => {});
  }
}

function ensureSuperVolumeControls(root = document) {
  ensureSuperVolumePreferenceLoaded();
  const video = ensureAudioGraph();
  if (video) {
    applySuperVolumeToMedia(video);
  }
  enhanceVolumePanel(root);
  ensureVolumeHotkeys();
  syncVolumeUi();
}

function ensureAudioGraph() {
  const video = document.querySelector("video.html5-main-video");
  if (!video) {
    return null;
  }
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) {
    return video;
  }
  if (!superVolumeAudioCtx) {
    try {
      superVolumeAudioCtx = new AudioContextCtor();
    } catch (error) {
      console.debug("[CTF-Blocker] audio context unavailable", error);
      return video;
    }
  }
  if (!superVolumeGainNode && superVolumeAudioCtx) {
    superVolumeGainNode = superVolumeAudioCtx.createGain();
    superVolumeGainNode.gain.value = superVolumePercent / 100;
    superVolumeGainNode.connect(superVolumeAudioCtx.destination);
  }
  if (superVolumeSourceMap.has(video)) {
    return video;
  }
  if (!superVolumeAudioCtx) {
    return video;
  }
  try {
    const source = superVolumeAudioCtx.createMediaElementSource(video);
    source.connect(superVolumeGainNode);
    superVolumeSourceMap.set(video, source);
    video.addEventListener("volumechange", handleNativeVolumeChange, true);
  } catch (error) {
    console.debug("[CTF-Blocker] unable to wire audio graph", error);
  }
  return video;
}

function applySuperVolumeToMedia(video) {
  if (!video) {
    return;
  }
  const normalized = Math.min(superVolumePercent / 100, 1);
  suppressNativeVolumeEvent = true;
  try {
    video.volume = normalized;
    video.dataset.ctfSuperVolumePercent = String(superVolumePercent);
  } catch (error) {
    console.debug("[CTF-Blocker] failed to set volume", error);
  } finally {
    suppressNativeVolumeEvent = false;
  }
  if (superVolumeGainNode) {
    superVolumeGainNode.gain.value = superVolumePercent / 100;
  }
}

async function loadLoopPreference() {
  try {
    const result = await chrome.storage.local.get([VIDEO_LOOP_STORAGE_KEY]);
    videoLoopEnabled = result[VIDEO_LOOP_STORAGE_KEY] ?? VIDEO_LOOP_DEFAULT;
    applyLoopToVideo();
  } catch (error) {
    console.debug("[CTF-Blocker] failed to load loop preference", error);
    videoLoopEnabled = VIDEO_LOOP_DEFAULT;
  }
}

async function persistLoopPreference(enabled) {
  try {
    await chrome.storage.local.set({ [VIDEO_LOOP_STORAGE_KEY]: enabled });
  } catch (error) {
    console.debug("[CTF-Blocker] failed to persist loop preference", error);
  }
}

function applyLoopToVideo() {
  const video = document.querySelector("video.html5-main-video");
  if (video) {
    video.loop = videoLoopEnabled;
  }
}

function toggleVideoLoop() {
  videoLoopEnabled = !videoLoopEnabled;
  persistLoopPreference(videoLoopEnabled);
  applyLoopToVideo();
  updateLoopButtonState();
}

function updateLoopButtonState() {
  const loopButton = document.querySelector(".ytp-loop-button");
  if (loopButton) {
    if (videoLoopEnabled) {
      loopButton.classList.add("ytp-loop-enabled");
      loopButton.setAttribute("aria-pressed", "true");
      loopButton.setAttribute("title", "Loop is on");
    } else {
      loopButton.classList.remove("ytp-loop-enabled");
      loopButton.setAttribute("aria-pressed", "false");
      loopButton.setAttribute("title", "Loop is off");
    }
  }
}

function createLoopButton() {
  if (loopButtonInjected) {
    return;
  }

  // Target the left section of right controls where subtitles button is
  const rightControlsLeft = document.querySelector(".ytp-right-controls-left");
  if (!rightControlsLeft) {
    return;
  }

  const existingButton = document.querySelector(".ytp-loop-button");
  if (existingButton) {
    loopButtonInjected = true;
    return;
  }

  const loopButton = document.createElement("button");
  loopButton.className = "ytp-loop-button ytp-button";
  loopButton.setAttribute("aria-label", "Loop");
  loopButton.setAttribute(
    "title",
    videoLoopEnabled ? "Loop is ON" : "Loop is OFF"
  );
  loopButton.setAttribute("aria-pressed", videoLoopEnabled ? "true" : "false");
  loopButton.setAttribute("data-priority", "6");

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("height", "100%");
  svg.setAttribute("version", "1.1");
  svg.setAttribute("viewBox", "0 0 36 36");
  svg.setAttribute("width", "100%");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute(
    "d",
    "M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"
  );
  path.setAttribute("fill", "#fff");

  svg.appendChild(path);
  loopButton.appendChild(svg);

  loopButton.addEventListener("click", toggleVideoLoop);

  // Insert after subtitles button in the rightControlsLeft container
  const subtitlesButton = rightControlsLeft.querySelector(
    ".ytp-subtitles-button"
  );
  if (subtitlesButton) {
    // Insert right after subtitles button
    if (subtitlesButton.nextSibling) {
      rightControlsLeft.insertBefore(loopButton, subtitlesButton.nextSibling);
    } else {
      rightControlsLeft.appendChild(loopButton);
    }
  } else {
    // Fallback: insert before settings button
    const settingsButton = rightControlsLeft.querySelector(
      ".ytp-settings-button"
    );
    if (settingsButton) {
      rightControlsLeft.insertBefore(loopButton, settingsButton);
    } else {
      rightControlsLeft.appendChild(loopButton);
    }
  }

  loopButtonInjected = true;
  updateLoopButtonState();

  if (!document.querySelector("#ctf-loop-button-styles")) {
    const style = document.createElement("style");
    style.id = "ctf-loop-button-styles";
    style.textContent = `
      .ytp-loop-button {
        opacity: 1;
      }
      .ytp-loop-button.ytp-loop-enabled svg path {
        fill: #3ea6ff !important;
      }
      .ytp-loop-button:hover svg path {
        fill: #3ea6ff !important;
      }
    `;
    document.head.appendChild(style);
  }
}

// ==================== SPATIAL AUDIO SIMULATION ====================

async function loadDolbyAtmosPreference() {
  try {
    const result = await chrome.storage.local.get([DOLBY_ATMOS_STORAGE_KEY]);
    dolbyAtmosEnabled = result[DOLBY_ATMOS_STORAGE_KEY] ?? false;
    if (dolbyAtmosEnabled) {
      applyDolbyAtmosEffect();
    }
  } catch (error) {
    console.debug(
      "[CTF-Blocker] failed to load Spatial audio preference",
      error
    );
    dolbyAtmosEnabled = false;
  }
}

async function persistDolbyAtmosPreference(enabled) {
  try {
    await chrome.storage.local.set({ [DOLBY_ATMOS_STORAGE_KEY]: enabled });
  } catch (error) {
    console.debug(
      "[CTF-Blocker] failed to persist Spatial audio preference",
      error
    );
  }
}

// ========== CLEAN 3D SPATIAL AUDIO ENGINE ==========
// Simple, distortion-free spatial audio processing
// - Clean bass boost without mud
// - Subtle stereo widening for 3D effect
// - Light reverb for space (not تشوش)

function createDolbyAtmosAudioGraph() {
  const video = document.querySelector("video.html5-main-video");
  if (!video) return null;

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return null;

  if (!superVolumeAudioCtx) {
    try {
      superVolumeAudioCtx = new AudioContextCtor();
    } catch (error) {
      console.debug("[CTF-Blocker] audio context unavailable", error);
      return null;
    }
  }

  const ctx = superVolumeAudioCtx;

  // ========== CLEAN 3D SPATIAL AUDIO - NO DISTORTION ==========
  // Simple chain: Bass -> Treble -> Stereo Width -> Light Reverb

  // 1. Clean Bass Boost (low shelf - smooth, no distortion)
  if (!dolbyBassFilter) {
    dolbyBassFilter = ctx.createBiquadFilter();
    dolbyBassFilter.type = "lowshelf";
    dolbyBassFilter.frequency.value = 150;
    dolbyBassFilter.gain.value = 4; // +4dB clean bass
  }

  // 2. Clean Treble/Clarity (high shelf)
  if (!dolbyTrebleFilter) {
    dolbyTrebleFilter = ctx.createBiquadFilter();
    dolbyTrebleFilter.type = "highshelf";
    dolbyTrebleFilter.frequency.value = 3000;
    dolbyTrebleFilter.gain.value = 2; // +2dB clarity
  }

  // 3. Light 3D Reverb (subtle room feel, NOT heavy)
  if (!dolbySpatialReverb) {
    dolbySpatialReverb = ctx.createConvolver();

    // Create a short, clean impulse response (150ms)
    const reverbLength = Math.floor(ctx.sampleRate * 0.15);
    const impulse = ctx.createBuffer(2, reverbLength, ctx.sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);

      // Clean exponential decay - no harsh reflections
      for (let i = 0; i < reverbLength; i++) {
        const t = i / ctx.sampleRate;
        const decay = Math.exp(-t * 20); // Fast, clean decay

        // Smooth noise (not harsh random)
        const smoothNoise =
          Math.sin(i * 0.05 + channel) * Math.cos(i * 0.03) * 0.5;

        data[i] = smoothNoise * decay * 0.08; // Very subtle
      }
    }
    dolbySpatialReverb.buffer = impulse;
  }

  // 4. Stereo Enhancer (simple mid-side processing)
  if (!dolbyStereoEnhancer) {
    dolbyStereoEnhancer = ctx.createStereoPanner();
    dolbyStereoEnhancer.pan.value = 0; // Center
  }

  return { ctx, video };
}

function applyDolbyAtmosEffect() {
  const result = createDolbyAtmosAudioGraph();
  if (!result) return;

  const { ctx, video } = result;

  // Check if already connected
  if (video.dataset.ctfDolbyAtmos === "true") return;

  try {
    let source;

    // Check if source already exists from super volume
    if (superVolumeSourceMap.has(video)) {
      source = superVolumeSourceMap.get(video);
    } else {
      source = ctx.createMediaElementSource(video);
      superVolumeSourceMap.set(video, source);
    }

    // ========== SIMPLE CLEAN 3D AUDIO CHAIN ==========
    // No complex crossfeed that causes distortion
    // Just: Source -> Bass -> Treble -> Reverb Mix -> Output

    const dryGain = ctx.createGain(); // Main signal (loud)
    const wetGain = ctx.createGain(); // Reverb signal (quiet)
    const masterGain = ctx.createGain(); // Final output

    // 90% dry (clear sound), 10% wet (subtle 3D space)
    dryGain.gain.value = 0.9;
    wetGain.gain.value = 0.1;
    masterGain.gain.value = 1.0; // No boost = no distortion

    // Disconnect existing connections
    source.disconnect();

    // Simple chain: Source -> Bass -> Treble -> Output
    source.connect(dolbyBassFilter);
    dolbyBassFilter.connect(dolbyTrebleFilter);
    dolbyTrebleFilter.connect(dryGain);

    // Parallel reverb path for 3D feel
    dolbyTrebleFilter.connect(dolbySpatialReverb);
    dolbySpatialReverb.connect(wetGain);

    // Mix dry + wet
    dryGain.connect(masterGain);
    wetGain.connect(masterGain);

    // Output to super volume or destination
    if (superVolumeGainNode) {
      masterGain.connect(superVolumeGainNode);
    } else {
      masterGain.connect(ctx.destination);
    }

    video.dataset.ctfDolbyAtmos = "true";

    // Set default volume to 50% when Spatial audio is enabled
    video.volume = 0.5;

    console.info(
      "[IPTUBE-X] 🎧 3D Spatial Audio enabled - Clean bass & clarity (volume set to 50%)"
    );
  } catch (error) {
    console.debug("[CTF-Blocker] unable to apply Spatial audio", error);
  }
}

function disableDolbyAtmosEffect() {
  const video = document.querySelector("video.html5-main-video");
  if (!video || video.dataset.ctfDolbyAtmos !== "true") return;

  try {
    // Reconnect source directly (bypass Spatial audio chain)
    if (superVolumeSourceMap.has(video) && superVolumeAudioCtx) {
      const source = superVolumeSourceMap.get(video);
      source.disconnect();

      if (superVolumeGainNode) {
        source.connect(superVolumeGainNode);
      } else {
        source.connect(superVolumeAudioCtx.destination);
      }
    }
    video.dataset.ctfDolbyAtmos = "false";
    console.info("[IPTUBE-X] 🎧 Spatial audio spatial audio disabled");
  } catch (error) {
    console.debug("[CTF-Blocker] unable to disable Spatial audio", error);
  }
}

function toggleDolbyAtmos() {
  dolbyAtmosEnabled = !dolbyAtmosEnabled;
  persistDolbyAtmosPreference(dolbyAtmosEnabled);

  if (dolbyAtmosEnabled) {
    applyDolbyAtmosEffect();
  } else {
    disableDolbyAtmosEffect();
  }

  updateDolbyAtmosButtonState();
}

function updateDolbyAtmosButtonState() {
  const dolbyButton = document.querySelector(".ytp-dolby-atmos-button");
  if (dolbyButton) {
    const img = dolbyButton.querySelector("img");
    if (dolbyAtmosEnabled) {
      dolbyButton.classList.add("ytp-dolby-enabled");
      dolbyButton.setAttribute("aria-pressed", "true");
      dolbyButton.setAttribute("title", "🎧 Spatial audio ON");
      // Green color when enabled
      if (img)
        img.style.filter =
          "brightness(1.3) sepia(1) hue-rotate(80deg) saturate(3)";
    } else {
      dolbyButton.classList.remove("ytp-dolby-enabled");
      dolbyButton.setAttribute("aria-pressed", "false");
      dolbyButton.setAttribute("title", "🎧 Spatial audio OFF");
      // White color when disabled
      if (img) img.style.filter = "brightness(1.1)";
    }
  }
}

function createDolbyAtmosButton() {
  if (dolbyAtmosButtonInjected) return;

  // Target the left section of right controls where subtitles button is
  const rightControlsLeft = document.querySelector(".ytp-right-controls-left");
  if (!rightControlsLeft) return;

  const existingButton = document.querySelector(".ytp-dolby-atmos-button");
  if (existingButton) {
    dolbyAtmosButtonInjected = true;
    return;
  }

  const dolbyButton = document.createElement("button");
  dolbyButton.className = "ytp-dolby-atmos-button ytp-button";
  dolbyButton.setAttribute("aria-label", "Spatial audio");
  dolbyButton.setAttribute(
    "title",
    dolbyAtmosEnabled ? "Spatial audio is ON" : "Spatial audio is OFF"
  );
  dolbyButton.setAttribute(
    "aria-pressed",
    dolbyAtmosEnabled ? "true" : "false"
  );
  dolbyButton.setAttribute("data-priority", "7");

  // Create Spatial audio icon using spatial-audio.svg image
  const img = document.createElement("img");
  img.src = chrome.runtime.getURL("spatial-audio.svg");
  img.alt = "Spatial audio";
  // White when OFF, green when ON (set via updateDolbyAtmosButtonState)
  img.style.cssText =
    "width: 28px; height: 28px; object-fit: contain; vertical-align: middle; opacity: 0.9; filter: brightness(1.1);";
  dolbyButton.appendChild(img);

  dolbyButton.addEventListener("click", toggleDolbyAtmos);

  // Insert after loop button in the rightControlsLeft container
  const loopButton = rightControlsLeft.querySelector(".ytp-loop-button");
  if (loopButton) {
    // Insert right after loop button
    if (loopButton.nextSibling) {
      rightControlsLeft.insertBefore(dolbyButton, loopButton.nextSibling);
    } else {
      rightControlsLeft.appendChild(dolbyButton);
    }
  } else {
    // Fallback: insert after subtitles button
    const subtitlesButton = rightControlsLeft.querySelector(
      ".ytp-subtitles-button"
    );
    if (subtitlesButton) {
      if (subtitlesButton.nextSibling) {
        rightControlsLeft.insertBefore(
          dolbyButton,
          subtitlesButton.nextSibling
        );
      } else {
        rightControlsLeft.appendChild(dolbyButton);
      }
    } else {
      // Last fallback: before settings button
      const settingsButton = rightControlsLeft.querySelector(
        ".ytp-settings-button"
      );
      if (settingsButton) {
        rightControlsLeft.insertBefore(dolbyButton, settingsButton);
      } else {
        rightControlsLeft.appendChild(dolbyButton);
      }
    }
  }

  dolbyAtmosButtonInjected = true;
  updateDolbyAtmosButtonState();

  if (!document.querySelector("#ctf-dolby-button-styles")) {
    const style = document.createElement("style");
    style.id = "ctf-dolby-button-styles";
    style.textContent = `
      .ytp-dolby-atmos-button {
        opacity: 1;
        display: flex !important;
        align-items: center;
        justify-content: center;
        min-width: 42px;
      }
      .ytp-dolby-atmos-button img {
        transition: all 0.2s ease;
      }
      .ytp-dolby-atmos-button.ytp-dolby-enabled img {
        opacity: 1 !important;
        filter: brightness(1.3) sepia(1) hue-rotate(80deg) saturate(3) drop-shadow(0 0 4px rgba(0, 255, 0, 0.6)) !important;
      }
      .ytp-dolby-atmos-button:hover img {
        opacity: 1 !important;
        filter: brightness(1.2) drop-shadow(0 0 2px rgba(155, 89, 182, 0.6)) !important;
        transform: scale(1.1);
      }
    `;
    document.head.appendChild(style);
  }
}

function ensureDolbyAtmosControls() {
  if (!dolbyAtmosButtonInjected) {
    createDolbyAtmosButton();
  }
  if (dolbyAtmosEnabled) {
    applyDolbyAtmosEffect();
  }
}

function ensureLoopControls() {
  if (!loopButtonInjected) {
    createLoopButton();
  }
  applyLoopToVideo();
  // Also ensure Spatial audio button is created
  ensureDolbyAtmosControls();
}

function syncVolumeUi() {
  const panel = document.querySelector(".ytp-volume-panel");
  if (!panel) {
    return;
  }
  const rounded = Math.round(superVolumePercent);
  panel.setAttribute("aria-valuemin", String(SUPER_VOLUME_MIN));
  panel.setAttribute("aria-valuemax", String(SUPER_VOLUME_MAX));
  panel.setAttribute("aria-valuenow", String(rounded));
  panel.setAttribute("aria-valuetext", `${rounded}% volume`);
  panel.setAttribute("data-tooltip-title", `Volume (0-${SUPER_VOLUME_MAX}%)`);

  const slider = panel.querySelector(".ytp-volume-slider");
  if (!slider) {
    return;
  }
  const ratio = superVolumePercent / SUPER_VOLUME_MAX;
  slider.dataset.ctfVolume = String(rounded);
  slider.style.setProperty("--ctf-volume-ratio", ratio.toFixed(4));
  const handle = slider.querySelector(".ytp-volume-slider-handle");
  if (handle) {
    const sliderWidth =
      slider.clientWidth || parseFloat(getComputedStyle(slider).width) || 40;
    const offset = Math.max(0, Math.min(sliderWidth, ratio * sliderWidth));
    handle.style.left = `${offset}px`;
  }
}

function enhanceVolumePanel(root = document) {
  collectMatches(root, ".ytp-volume-panel").forEach((panel) => {
    if (!panel.dataset.ctfVolumePanel) {
      panel.dataset.ctfVolumePanel = "true";
      panel.addEventListener("keydown", handlePanelKeyDown, true);
    }
    panel.setAttribute("aria-valuemin", String(SUPER_VOLUME_MIN));
    panel.setAttribute("aria-valuemax", String(SUPER_VOLUME_MAX));
    panel.setAttribute("data-tooltip-title", `Volume (0-${SUPER_VOLUME_MAX}%)`);
    const slider = panel.querySelector(".ytp-volume-slider");
    if (slider) {
      prepareVolumeSlider(slider);
    }
  });
}

function prepareVolumeSlider(slider) {
  if (slider.dataset.ctfVolumeSlider === "true") {
    return;
  }
  slider.dataset.ctfVolumeSlider = "true";
  slider.classList.add("ctf-volume-boost-slider");
  const computedStyle = getComputedStyle(slider);
  if (computedStyle.position === "static") {
    slider.style.position = "relative";
  }
  slider.addEventListener("pointerdown", handleSliderPointerDown, true);
  slider.addEventListener("wheel", handleSliderWheel, {
    passive: false,
    capture: true
  });
}

function handleSliderPointerDown(event) {
  if (
    event.button !== 0 &&
    event.pointerType !== "touch" &&
    event.pointerType !== "pen"
  ) {
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
  const slider = event.currentTarget;
  sliderDragActive = true;
  slider.setPointerCapture?.(event.pointerId);
  slider.dataset.ctfPointerId = String(event.pointerId);
  slider.addEventListener("pointermove", handleSliderPointerMove, true);
  slider.addEventListener("pointerup", handleSliderPointerUp, true);
  slider.addEventListener("pointercancel", handleSliderPointerUp, true);
  updateVolumeFromPointer(slider, event, { skipPersist: true });
}

function handleSliderPointerMove(event) {
  if (!sliderDragActive) {
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
  const slider = event.currentTarget;
  updateVolumeFromPointer(slider, event, { skipPersist: true });
}

function handleSliderPointerUp(event) {
  if (!sliderDragActive) {
    return;
  }
  sliderDragActive = false;
  event.preventDefault();
  event.stopImmediatePropagation();
  const slider = event.currentTarget;
  const pointerId = slider.dataset.ctfPointerId;
  if (pointerId) {
    slider.releasePointerCapture?.(Number(pointerId));
    delete slider.dataset.ctfPointerId;
  }
  slider.removeEventListener("pointermove", handleSliderPointerMove, true);
  slider.removeEventListener("pointerup", handleSliderPointerUp, true);
  slider.removeEventListener("pointercancel", handleSliderPointerUp, true);
  updateVolumeFromPointer(slider, event);
}

function updateVolumeFromPointer(slider, event, options = {}) {
  const rect = slider.getBoundingClientRect();
  if (!rect.width) {
    return;
  }
  const ratio = (event.clientX - rect.left) / rect.width;
  const boundedRatio = Math.max(0, Math.min(1, ratio));
  resumeSuperVolumeContext();
  setSuperVolumePercent(boundedRatio * SUPER_VOLUME_MAX, {
    skipPersist: options.skipPersist
  });
}

function handleSliderWheel(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
  if (!event.deltaY) {
    return;
  }
  const step = event.shiftKey ? SUPER_VOLUME_FAST_STEP : SUPER_VOLUME_STEP;
  const delta = event.deltaY < 0 ? step : -step;
  resumeSuperVolumeContext();
  setSuperVolumePercent(superVolumePercent + delta);
}

function handlePanelKeyDown(event) {
  const actionableKeys = new Set([
    "ArrowUp",
    "ArrowDown",
    "Home",
    "End",
    "PageUp",
    "PageDown"
  ]);
  if (!actionableKeys.has(event.key)) {
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
  const baseStep = event.shiftKey ? SUPER_VOLUME_FAST_STEP : SUPER_VOLUME_STEP;
  switch (event.key) {
    case "ArrowUp":
    case "PageUp":
      resumeSuperVolumeContext();
      setSuperVolumePercent(superVolumePercent + baseStep);
      break;
    case "ArrowDown":
    case "PageDown":
      resumeSuperVolumeContext();
      setSuperVolumePercent(superVolumePercent - baseStep);
      break;
    case "Home":
      resumeSuperVolumeContext();
      setSuperVolumePercent(SUPER_VOLUME_MIN);
      break;
    case "End":
      resumeSuperVolumeContext();
      setSuperVolumePercent(SUPER_VOLUME_MAX);
      break;
    default:
      break;
  }
}

function ensureVolumeHotkeys() {
  if (superVolumeHotkeysBound) {
    return;
  }
  window.addEventListener("keydown", handleGlobalVolumeKeys, true);
  superVolumeHotkeysBound = true;
}

function handleGlobalVolumeKeys(event) {
  if (event.defaultPrevented) {
    return;
  }
  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
    return;
  }
  if (shouldIgnoreKeyEvent(event)) {
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
  const step = event.shiftKey ? SUPER_VOLUME_FAST_STEP : SUPER_VOLUME_STEP;
  const delta = event.key === "ArrowUp" ? step : -step;
  resumeSuperVolumeContext();
  setSuperVolumePercent(superVolumePercent + delta);
}

function shouldIgnoreKeyEvent(event) {
  const target = event.target;
  if (!target) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tagName = target.tagName;
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
}

function handleNativeVolumeChange(event) {
  if (suppressNativeVolumeEvent) {
    return;
  }
  const video = event.currentTarget;
  if (!video || video.muted) {
    return;
  }
  applySuperVolumeToMedia(video);
  syncVolumeUi();
}

function setSuperVolumePercent(value, options = {}) {
  ensureSuperVolumePreferenceLoaded();
  const clamped = clampSuperVolume(value);
  if (clamped === superVolumePercent && !options.force) {
    if (!options.skipUi) {
      syncVolumeUi();
    }
    return;
  }
  superVolumePercent = clamped;
  if (!options.skipPersist) {
    persistSuperVolumePreference(clamped);
  }
  const video = ensureAudioGraph();
  if (video) {
    applySuperVolumeToMedia(video);
  }
  if (!options.skipUi) {
    syncVolumeUi();
  }
}
