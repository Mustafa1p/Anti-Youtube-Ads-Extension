importScripts(
  "featureSettings.js",
  "sponsorBlockService.js",
  "adBlockingService.js"
);

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

chrome.runtime.onInstalled.addListener(async () => {
  await enqueueCountOperation(() => writeCount(0));
  await AdBlockingService.sync().catch(console.error);
  console.info("[CTF-Blocker] Ready. YouTube site data preserved.");
});

if (chrome.declarativeNetRequest?.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(async (info) => {
    if (info?.rule?.id) {
      await incrementBlockedCount();
    }
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "SET_AD_BLOCKING") {
    const extensionPage =
      sender.id === chrome.runtime.id &&
      sender.url?.startsWith(chrome.runtime.getURL(""));
    const youtubePage =
      sender.id === chrome.runtime.id &&
      sender.tab &&
      /^https:\/\/www\.youtube\.com\//.test(sender.url || "");
    if (
      (!extensionPage && !youtubePage) ||
      typeof message.enabled !== "boolean"
    )
      return false;
    AdBlockingService.setEnabled(message.enabled)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

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
