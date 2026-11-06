document.addEventListener("DOMContentLoaded", () => {
  const check = document.getElementById("checkUpdates");
  const status = document.getElementById("updateStatus");
  const download = document.getElementById("downloadUpdate");
  const instructions = document.getElementById("updateInstructions");
  document.getElementById("installedVersion").textContent =
    `V${chrome.runtime.getManifest().version}`;
  function render(state) {
    if (!state) throw new Error("No update status");
    download.hidden = !state.available;
    instructions.open = state.available;
    if (state.available) {
      download.href = state.downloadUrl;
      download.textContent = `Download v${state.latestVersion}`;
      status.textContent = `v${state.latestVersion} is available${state.error ? " · last check failed; showing saved release" : ""}`;
    } else {
      download.removeAttribute("href");
      status.textContent = state.error
        ? "Could not reach GitHub. Try again when online."
        : state.checkedAt
          ? `You're up to date · v${state.currentVersion}`
          : "Check GitHub for the latest release.";
    }
  }
  async function refresh(force) {
    check.disabled = true;
    status.textContent = "Checking GitHub…";
    try {
      const reply = await chrome.runtime.sendMessage({
        type: "CHECK_EXTENSION_UPDATE",
        force
      });
      if (!reply?.ok) throw new Error("Check failed");
      render(reply.state);
    } catch {
      status.textContent = "Could not check for updates. Please try again.";
    } finally {
      check.disabled = false;
    }
  }
  check.addEventListener("click", () => refresh(true));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.iptubeUpdateState) {
      chrome.runtime
        .sendMessage({ type: "GET_EXTENSION_UPDATE" })
        .then((reply) => {
          if (reply?.ok) render(reply.state);
        })
        .catch(() => {});
    }
  });
  refresh(false);
});
