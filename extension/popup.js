document.addEventListener("DOMContentLoaded", () => {
  const videoInput = document.getElementById("videoInput");
  const addButton = document.getElementById("addBtn");
  const videoList = document.getElementById("videoList");
  const statusMessage = document.getElementById("statusMsg");
  let statusTimeout;
  let pendingUpdate = Promise.resolve();
  const featureInputs = new Map();
  const categoryInputs = new Map();
  const featureDefinitions = [
    [
      "sponsorBlock",
      "SponsorBlock",
      "Skip community-marked segments · optional service"
    ],
    [
      "highestQuality",
      "Highest available quality",
      "Request the best resolution offered by the player"
    ],
    [
      "audioOnly",
      "Audio mode",
      "Hide the picture; keep audio and playback controls"
    ],
    [
      "upgradeThumbnails",
      "Sharper thumbnails",
      "Load higher-resolution artwork when available"
    ],
    ["showClock", "On-screen clock", "Your local time, always within view"],
    ["hideLogo", "Hide header logo", "A quieter YouTube header"],
    ["reduceMotion", "Reduce theme motion", "Stop decorative theme animations"],
    [
      "cinematicEffects",
      "Cinematic effects",
      "Special video timeline + your ambilight playlist"
    ]
  ];

  function renderSettings(settings) {
    for (const [key, input] of featureInputs) input.checked = settings[key];
    for (const [category, input] of categoryInputs)
      input.checked = settings.sponsorCategories.includes(category);
  }

  function saveSetting(key, value) {
    enqueueUpdate(async () => {
      const settings = await FeatureSettings.load();
      settings[key] = value;
      const next = FeatureSettings.normalize(settings);
      await chrome.storage.local.set({ [FeatureSettings.STORAGE_KEY]: next });
      renderSettings(next);
      showStatus("Settings saved · applies to open YouTube tabs");
    });
  }

  for (const [key, title, hint] of featureDefinitions) {
    const row = document.createElement("label");
    row.className = "feature-row";
    const copy = document.createElement("span");
    copy.className = "feature-copy";
    const heading = document.createElement("span");
    heading.className = "feature-title";
    heading.textContent = title;
    const description = document.createElement("span");
    description.className = "feature-hint";
    description.textContent = hint;
    copy.append(heading, description);
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = FeatureSettings.DEFAULTS[key];
    input.setAttribute("aria-label", title);
    input.addEventListener("change", () => saveSetting(key, input.checked));
    featureInputs.set(key, input);
    row.append(copy, input);
    document.getElementById("featureList").appendChild(row);
  }

  const categoryLabels = {
    sponsor: "Sponsors",
    intro: "Intros",
    outro: "Outros",
    selfpromo: "Self promotion",
    interaction: "Interaction reminders",
    music_offtopic: "Non-music sections",
    preview: "Recaps / previews"
  };
  for (const category of FeatureSettings.CATEGORIES) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked =
      FeatureSettings.DEFAULTS.sponsorCategories.includes(category);
    input.addEventListener("change", () =>
      saveSetting(
        "sponsorCategories",
        Array.from(categoryInputs)
          .filter(([, checkbox]) => checkbox.checked)
          .map(([key]) => key)
      )
    );
    categoryInputs.set(category, input);
    label.append(input, document.createTextNode(categoryLabels[category]));
    document.getElementById("sponsorCategories").appendChild(label);
  }

  function showStatus(message) {
    clearTimeout(statusTimeout);
    statusMessage.textContent = message;
    statusTimeout = setTimeout(() => {
      statusMessage.textContent = "";
    }, 3000);
  }

  // Serialize read/modify/write operations so rapid clicks cannot lose changes.
  function enqueueUpdate(operation) {
    pendingUpdate = pendingUpdate.then(operation).catch((error) => {
      console.error("[Stranger Things] Video settings update failed", error);
      showStatus(
        "Could not save settings. Please reopen the popup and try again."
      );
    });
  }

  function renderList(ids) {
    videoList.replaceChildren();
    for (const id of ids) {
      const item = document.createElement("li");
      item.className = "video-item";
      const label = document.createElement("span");
      label.className = "video-id";
      label.textContent = id;
      const removeButton = document.createElement("button");
      removeButton.className = "delete-btn";
      removeButton.textContent = "×";
      removeButton.title = "Remove";
      removeButton.setAttribute("aria-label", `Remove video ${id}`);
      removeButton.addEventListener("click", () =>
        enqueueUpdate(async () => {
          const ids = (await VideoSettings.load()).filter(
            (value) => value !== id
          );
          await VideoSettings.save(ids);
          renderList(ids);
          showStatus("Video Removed");
        })
      );
      item.append(label, removeButton);
      videoList.appendChild(item);
    }
  }

  function addVideo() {
    const input = videoInput.value.trim();
    if (!input) return;
    const id = VideoSettings.extractVideoId(input);
    if (!id) {
      showStatus("Invalid YouTube Link/ID");
      return;
    }
    enqueueUpdate(async () => {
      const ids = await VideoSettings.load();
      if (ids.includes(id)) {
        showStatus("Video already in the loop");
        return;
      }
      ids.push(id);
      await VideoSettings.save(ids);
      renderList(ids);
      if (videoInput.value.trim() === input) videoInput.value = "";
      showStatus("Video Added to Reality");
    });
  }

  enqueueUpdate(async () => renderList(await VideoSettings.load()));
  enqueueUpdate(async () => renderSettings(await FeatureSettings.load()));
  addButton.addEventListener("click", addVideo);
  videoInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") addVideo();
  });
});
