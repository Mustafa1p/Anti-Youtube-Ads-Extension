// Shared by the popup and isolated YouTube content scripts. No remote requests.
const ThemeSettings = (() => {
  const STORAGE_KEY = "iptubeTheme";
  const DEFAULT_ID = "stranger-things";
  // Palette roles: canvas, surface, raised, accent, secondary, text, muted,
  // on-accent, border, radius, display font. Keep video imagery untouched.
  const THEMES = [
    {
      id: "original",
      name: "Original YouTube",
      tagline: "Just like home",
      mark: "YouTube",
      colors: [
        "#0f0f0f",
        "#181818",
        "#272727",
        "#ff4343",
        "#ffffff",
        "#f1f1f1",
        "#aaaaaa",
        "#ffffff",
        "#444444"
      ],
      radius: "12px",
      font: "Roboto, Arial, sans-serif"
    },
    {
      id: "stranger-things",
      name: "Stranger Things",
      tagline: "The Upside Down",
      mark: "STRANGER THINGS",
      colors: [
        "#050505",
        "#13080c",
        "#231017",
        "#ff475d",
        "#6c8cff",
        "#fff1f2",
        "#d4aab2",
        "#160307",
        "#662631"
      ],
      radius: "4px",
      font: 'Georgia, "Times New Roman", serif'
    },
    {
      id: "breaking-bad",
      name: "Breaking Bad",
      tagline: "Chemistry. Transformed.",
      asset: "breaking-bad.svg",
      colors: [
        "#07130e",
        "#0d2117",
        "#163424",
        "#8bda67",
        "#dfc65b",
        "#edf6e9",
        "#acc1aa",
        "#10200c",
        "#3d6140"
      ],
      radius: "3px",
      font: '"Courier New", monospace'
    },
    {
      id: "game-of-thrones",
      name: "Game of Thrones",
      tagline: "Winter is coming",
      asset: "game-of-thrones.png",
      colors: [
        "#080f19",
        "#101d2b",
        "#1c2e40",
        "#b9d8ef",
        "#cfad6d",
        "#edf3f9",
        "#a6b8c9",
        "#101923",
        "#46586a"
      ],
      radius: "2px",
      font: 'Georgia, "Times New Roman", serif'
    },
    {
      id: "gta-vi",
      name: "GTA VI",
      tagline: "Vice City after dark",
      asset: "gta-vi.png",
      colors: [
        "#160d22",
        "#251531",
        "#3c2347",
        "#ff8cd9",
        "#69e5dc",
        "#fff0fa",
        "#cfb2d5",
        "#2b1028",
        "#795276"
      ],
      radius: "16px",
      font: '"Arial Black", Arial, sans-serif'
    },
    {
      id: "modern-warfare",
      name: "Call of Duty: Modern Warfare 4",
      tagline: "Tactical precision",
      asset: "modern-warfare.png",
      colors: [
        "#101618",
        "#1a2427",
        "#2a373a",
        "#f3cc34",
        "#a5b9b5",
        "#f1f4ee",
        "#b0bfba",
        "#1c1b08",
        "#52615d"
      ],
      radius: "1px",
      font: '"Arial Narrow", Impact, sans-serif'
    },
    {
      id: "xbox",
      name: "Xbox",
      tagline: "Power your play",
      asset: "xbox.png",
      colors: [
        "#071007",
        "#101f10",
        "#1c321b",
        "#8bdf55",
        "#e5f4dc",
        "#f2f8ed",
        "#b0c3a9",
        "#12200b",
        "#42603a"
      ],
      radius: "8px",
      font: '"Segoe UI", Arial, sans-serif'
    },
    {
      id: "ps5",
      name: "PS5",
      tagline: "Play has no limits",
      asset: "ps5.png",
      colors: [
        "#080e22",
        "#101e3a",
        "#1c3155",
        "#8cbcff",
        "#e8f1ff",
        "#f4f7ff",
        "#afc0dc",
        "#071a38",
        "#45618e"
      ],
      radius: "20px",
      font: '"Segoe UI", Arial, sans-serif'
    },
    {
      id: "netflix",
      name: "Netflix",
      tagline: "Your next obsession",
      asset: "netflix.png",
      colors: [
        "#0b0b0b",
        "#181818",
        "#292929",
        "#ff4854",
        "#e50914",
        "#ffffff",
        "#bdbdbd",
        "#210005",
        "#633038"
      ],
      radius: "4px",
      font: "Arial, Helvetica, sans-serif"
    }
  ].map((theme) =>
    Object.freeze({ ...theme, colors: Object.freeze(theme.colors) })
  );
  function normalize(value) {
    return THEMES.some((theme) => theme.id === value) ? value : DEFAULT_ID;
  }
  function get(value) {
    return THEMES.find((theme) => theme.id === normalize(value));
  }
  function tokens(theme) {
    const roles = [
      "bg",
      "surface",
      "raised",
      "accent",
      "secondary",
      "text",
      "muted",
      "on-accent",
      "border"
    ];
    return Object.fromEntries([
      ...roles.map((role, i) => [`--ipt-${role}`, theme.colors[i]]),
      ["--ipt-radius", theme.radius],
      ["--ipt-display", theme.font]
    ]);
  }
  async function load() {
    const saved = await chrome.storage.local.get([STORAGE_KEY]);
    return normalize(saved[STORAGE_KEY]);
  }
  return Object.freeze({
    STORAGE_KEY,
    DEFAULT_ID,
    THEMES: Object.freeze(THEMES),
    normalize,
    get,
    tokens,
    load
  });
})();
