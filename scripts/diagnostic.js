// Diagnostic script for YouTube download button
// Paste this in the console on the YouTube video page

console.log("=== DIAGNOSTIC START ===");

// Check 1: Video ID
const videoId = new URLSearchParams(window.location.search).get("v");
console.log("1. Video ID:", videoId);

// Check 2: Window player response
console.log(
  "2. window.ytInitialPlayerResponse exists:",
  !!window.ytInitialPlayerResponse
);
if (window.ytInitialPlayerResponse) {
  console.log(
    "   - Has streamingData:",
    !!window.ytInitialPlayerResponse.streamingData
  );
  if (window.ytInitialPlayerResponse.streamingData) {
    const adaptiveCount =
      window.ytInitialPlayerResponse.streamingData.adaptiveFormats?.length || 0;
    const regularCount =
      window.ytInitialPlayerResponse.streamingData.formats?.length || 0;
    console.log("   - Adaptive formats:", adaptiveCount);
    console.log("   - Regular formats:", regularCount);
    console.log("   - Total formats:", adaptiveCount + regularCount);

    // Check for URLs vs encrypted signatures
    const allFormats = [
      ...(window.ytInitialPlayerResponse.streamingData.formats || []),
      ...(window.ytInitialPlayerResponse.streamingData.adaptiveFormats || [])
    ];

    let withUrl = 0;
    let withCipher = 0;
    let withSignature = 0;

    allFormats.forEach((f) => {
      if (f.url) withUrl++;
      if (f.signatureCipher) withCipher++;
      if (f.cipher) withSignature++;
    });

    console.log("   - Formats with direct URL:", withUrl);
    console.log("   - Formats with signatureCipher:", withCipher);
    console.log("   - Formats with cipher:", withSignature);
  }
}

// Check 3: Script tag extraction
console.log("3. Looking for ytInitialPlayerResponse in script tags...");
const scripts = document.querySelectorAll("script");
let foundInScript = false;
for (const script of scripts) {
  const content = script.textContent || "";
  if (content.includes("ytInitialPlayerResponse")) {
    foundInScript = true;
    const match = content.match(
      /var\s+ytInitialPlayerResponse\s*=\s*({.+?});/s
    );
    if (match) {
      console.log("   - Found in script tag (can be parsed)");
      try {
        const parsed = JSON.parse(match[1]);
        console.log("   - Parsed successfully");
        console.log("   - Has streamingData:", !!parsed.streamingData);
      } catch (e) {
        console.log("   - Failed to parse:", e.message);
      }
    } else {
      console.log("   - Found but cannot extract JSON");
    }
    break;
  }
}
if (!foundInScript) {
  console.log("   - NOT found in script tags");
}

// Check 4: Dataset
console.log(
  "4. document.documentElement.dataset.ctfVideoUrl:",
  document.documentElement.dataset.ctfVideoUrl
);

// Check 5: Download button state
const downloadBtn = document.querySelector(
  '[aria-label="Download this video"]'
);
console.log("5. Download button exists:", !!downloadBtn);
if (downloadBtn) {
  console.log("   - Disabled:", downloadBtn.disabled);
  console.log("   - Opacity:", downloadBtn.style.opacity);
  console.log("   - Cursor:", downloadBtn.style.cursor);
}

// Check 6: Subscribe button (where download button should be)
const subscribeBtn = document.querySelector("#subscribe-button");
console.log("6. Subscribe button container exists:", !!subscribeBtn);

console.log("=== DIAGNOSTIC END ===");
