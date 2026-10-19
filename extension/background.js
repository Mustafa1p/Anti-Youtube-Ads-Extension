importScripts("featureSettings.js", "sponsorBlockService.js");

const STORAGE_KEY = "blockedRequestCount";
let pendingCountOperation = Promise.resolve();

// Storage has no atomic increment. Queue reads, increments, and resets together.
function enqueueCountOperation(operation) {
  const result = pendingCountOperation.then(operation);
  pendingCountOperation = result.catch(() => {});
  return result;
}

async function readCount() {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEY]);
    const count = Number(result[STORAGE_KEY] ?? 0);
    return Number.isSafeInteger(count) && count >= 0 ? count : 0;
  } catch (error) {
    console.error("[CTF-Blocker] Failed to read count", error);
    return 0;
  }
}

async function writeCount(next) {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: next });
  } catch (error) {
    console.error("[CTF-Blocker] Failed to persist count", error);
  }
}

function incrementBlockedCount() {
  return enqueueCountOperation(async () => {
    const current = await readCount();
    const next = Math.min(current + 1, Number.MAX_SAFE_INTEGER);
    await writeCount(next);
    return next;
  });
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await enqueueCountOperation(() => writeCount(0));
  console.info("[CTF-Blocker] Ready to block YouTube ads.");

  // On install/update, clear only detection-related data (preserve auth)
  if (details.reason === "install" || details.reason === "update") {
    try {
      // Clear cache and non-auth storage only
      await chrome.browsingData.remove(
        {
          origins: [
            "https://www.youtube.com",
            "https://youtube.com",
            "https://m.youtube.com"
          ]
        },
        {
          appcache: true,
          cache: true,
          cacheStorage: true,
          cookies: false, // Don't clear cookies - handled selectively by storageSanitizer
          downloads: false,
          fileSystems: true,
          formData: false, // Preserve form data
          history: false,
          indexedDB: true,
          localStorage: true,
          passwords: false,
          pluginData: true,
          serviceWorkers: true,
          webSQL: true
        }
      );
      console.info(
        "[CTF-Blocker] Cleared YouTube cache/storage (auth preserved)"
      );
    } catch (error) {
      console.warn("[CTF-Blocker] Could not clear storage:", error);
    }
  }
});

if (chrome.declarativeNetRequest?.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(async (info) => {
    if (info?.rule?.id) {
      await incrementBlockedCount();
    }
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "GET_SPONSOR_SEGMENTS") {
    if (!sender.tab || !/^https:\/\/www\.youtube\.com\//.test(sender.url || ""))
      return false;
    SponsorBlockService.getSegments(message.videoId)
      .then((segments) => sendResponse({ segments }))
      .catch((error) => sendResponse({ segments: [], error: error.message }));
    return true;
  }

  if (message?.type === "GET_BLOCK_STATS") {
    enqueueCountOperation(readCount).then((blockedRequestCount) => {
      sendResponse({ blockedRequestCount });
    });
    return true;
  }

  if (message?.type === "INCREMENT_BLOCK_COUNT") {
    incrementBlockedCount().then((blockedRequestCount) => {
      sendResponse({ blockedRequestCount });
    });
    return true;
  }

  if (message?.type === "RESET_BLOCK_STATS") {
    enqueueCountOperation(() => writeCount(0)).then(() =>
      sendResponse({ ok: true })
    );
    return true;
  }

  return false;
});
