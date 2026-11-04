const AdBlockingService = (() => {
  const KEY = "adBlockingEnabled";
  let pending = Promise.resolve();
  function enqueue(operation) {
    const result = pending.then(operation);
    pending = result.catch(() => {});
    return result;
  }
  async function updateRules(enabled) {
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: enabled ? ["youtube_rules"] : [],
      disableRulesetIds: enabled ? [] : ["youtube_rules"]
    });
  }
  function sync() {
    return enqueue(async () => {
      const saved = await chrome.storage.local.get([KEY]);
      await updateRules(saved[KEY] !== false);
    });
  }
  function setEnabled(enabled) {
    return enqueue(async () => {
      const previous = await chrome.storage.local.get([KEY]);
      // A successful reply means both network and page blocking can be paused.
      await updateRules(enabled);
      try {
        await chrome.storage.local.set({ [KEY]: enabled });
      } catch (error) {
        await updateRules(previous[KEY] !== false);
        throw error;
      }
    });
  }
  if (chrome.declarativeNetRequest?.updateEnabledRulesets) {
    sync().catch(console.error);
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes[KEY]) sync().catch(console.error);
    });
  }
  return Object.freeze({ sync, setEnabled });
})();
