document.addEventListener("DOMContentLoaded", () => {
  const grid = document.getElementById("themeGrid");
  const hint = document.getElementById("themeHint");
  const cards = new Map();
  let selected = ThemeSettings.DEFAULT_ID;
  let pending = Promise.resolve();
  let revision = 0;
  function render(value) {
    selected = ThemeSettings.normalize(value);
    for (const [id, card] of cards)
      card.setAttribute("aria-pressed", String(id === selected));
    const theme = ThemeSettings.get(selected);
    for (const [key, token] of Object.entries(ThemeSettings.tokens(theme)))
      document.documentElement.style.setProperty(key, token);
    hint.textContent =
      selected === "original"
        ? "Original YouTube · visual theme removed"
        : `${theme.name} · applies instantly to open YouTube tabs`;
  }
  for (const theme of ThemeSettings.THEMES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "theme-card";
    button.dataset.theme = theme.id;
    button.disabled = true;
    button.setAttribute("aria-label", theme.name);
    button.setAttribute("aria-pressed", "false");
    for (const [key, token] of Object.entries(ThemeSettings.tokens(theme)))
      button.style.setProperty(key, token);
    const art = document.createElement("span");
    art.className = "theme-art";
    art.setAttribute("aria-hidden", "true");
    if (theme.asset) {
      const img = document.createElement("img");
      img.src = `themes/${theme.asset}`;
      img.alt = "";
      img.width = 100;
      img.height = 44;
      art.appendChild(img);
    } else {
      const mark = document.createElement("span");
      mark.className = "theme-mark";
      mark.textContent = theme.mark;
      art.appendChild(mark);
    }
    const check = document.createElement("span");
    check.className = "theme-check";
    check.textContent = "✓";
    art.appendChild(check);
    const label = document.createElement("span");
    label.className = "theme-name";
    label.textContent = theme.name;
    const caption = document.createElement("span");
    caption.className = "theme-caption";
    caption.textContent = theme.tagline;
    const palette = document.createElement("span");
    palette.className = "theme-palette";
    palette.setAttribute("aria-hidden", "true");
    for (const color of [
      theme.colors[0],
      theme.colors[2],
      theme.colors[3],
      theme.colors[4]
    ]) {
      const swatch = document.createElement("i");
      swatch.style.backgroundColor = color;
      palette.appendChild(swatch);
    }
    button.append(art, label, caption, palette);
    button.addEventListener("click", () => {
      // Serialize rapid selections; only show a selection as saved after persistence.
      pending = pending.then(async () => {
        hint.textContent = `Applying ${theme.name}…`;
        try {
          await chrome.storage.local.set({
            [ThemeSettings.STORAGE_KEY]: theme.id
          });
          render(theme.id);
        } catch {
          hint.textContent = `Could not save ${theme.name}. Please try again.`;
        }
      });
    });
    cards.set(theme.id, button);
    grid.appendChild(button);
  }
  const initialRevision = revision;
  ThemeSettings.load()
    .then((value) => {
      if (revision === initialRevision) render(value);
    })
    .catch(() => {
      render(selected);
      hint.textContent =
        "Could not load your saved theme. Select one to try again.";
    })
    .finally(() => {
      for (const card of cards.values()) card.disabled = false;
    });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[ThemeSettings.STORAGE_KEY]) {
      revision++;
      render(changes[ThemeSettings.STORAGE_KEY].newValue);
    }
  });
});
