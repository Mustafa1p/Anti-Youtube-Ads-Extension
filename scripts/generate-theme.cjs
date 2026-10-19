// Original procedural artwork, licensed with this project's MIT source code.
const fs = require("node:fs");
const path = require("node:path");
const { extension } = require("./project.cjs");
const palettes = [
  ["Crimson horizon", "#2c0714", "#ee2349", "#06050e"],
  ["Frozen signal", "#061f35", "#3d9db6", "#030711"],
  ["Violet storm", "#200d36", "#b44e9f", "#080611"],
  ["Ember field", "#2b100d", "#e66b39", "#090608"],
  ["Midnight forest", "#081b24", "#488582", "#02070c"],
  ["Electric dusk", "#180c32", "#8e6ce8", "#05050e"],
  ["Scarlet eclipse", "#290a1c", "#e83b65", "#08040a"]
];
fs.mkdirSync(path.join(extension, "background"), { recursive: true });
for (const [index, [title, sky, glow, ground]] of palettes.entries()) {
  let seed = index + 1234;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const stars = Array.from(
    { length: 110 },
    () =>
      `<circle cx="${Math.round(random() * 1600)}" cy="${Math.round(random() * 650)}" r="${(random() * 1.7 + 0.5).toFixed(1)}" opacity="${(random() * 0.5 + 0.1).toFixed(2)}"/>`
  ).join("");
  const trees = Array.from({ length: 18 }, (_, i) => {
    const x = Math.round(i * 100 + random() * 50);
    const height = Math.round(100 + random() * 200);
    return `<path d="M${x} 900v-${height}m0 55l-32 -35m32 76l38 -42m-38 83l-45 -40"/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
<title>${title}</title><desc>Original IPTUBE procedural night landscape. MIT license.</desc>
<defs><radialGradient id="sky"><stop stop-color="${sky}"/><stop offset="1" stop-color="${ground}"/></radialGradient><radialGradient id="halo"><stop stop-color="${glow}" stop-opacity=".45"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient><linearGradient id="mist" x2="0" y2="1"><stop stop-color="${glow}" stop-opacity="0"/><stop offset="1" stop-color="${glow}" stop-opacity=".12"/></linearGradient></defs>
<path fill="url(#sky)" d="M0 0h1600v900H0z"/><ellipse cx="800" cy="400" rx="750" ry="420" fill="url(#halo)"/><g fill="${glow}">${stars}</g>
<circle cx="${680 + index * 25}" cy="330" r="130" fill="none" stroke="${glow}" stroke-opacity=".23" stroke-width="3"/><circle cx="${680 + index * 25}" cy="330" r="114" fill="${ground}" opacity=".8"/>
<path d="M1000 20l-90 150 55 -10 -130 205 45 -125 -55 15z" fill="${glow}" opacity=".36"/>
<path d="M0 650l180 -90 130 80 200 -115 200 140 170 -90 170 60 190 -110 160 120v255H0z" fill="${ground}" opacity=".65"/>
<path d="M0 760q240 -120 500 0t500 -20 600 0v160H0z" fill="${ground}"/>
<path fill="url(#mist)" d="M0 400h1600v500H0z"/>
<g stroke="${ground}" stroke-width="10" fill="none" stroke-linecap="round">${trees}</g>
<path d="M0 850q300 -50 650 5t950 -10v55H0z" fill="${ground}"/>
</svg>\n`;
  fs.writeFileSync(path.join(extension, "background", `${index + 1}.svg`), svg);
}
fs.writeFileSync(
  path.join(extension, "spatial-audio.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><title>Spatial audio</title><g fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><circle cx="16" cy="16" r="3"/><path d="M10 10a9 9 0 0 0 0 12m12 -12a9 9 0 0 1 0 12M6 6a14 14 0 0 0 0 20M26 6a14 14 0 0 1 0 20"/></g></svg>\n`
);
console.log("Generated 7 original backgrounds and the spatial audio icon.");
