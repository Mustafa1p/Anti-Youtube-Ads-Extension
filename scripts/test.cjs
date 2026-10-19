const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { root } = require("./project.cjs");

// Limit discovery to source tests; ignored build/export folders can contain copies.
const files = fs
  .readdirSync(path.join(root, "tests"))
  .filter((name) => name.endsWith(".test.cjs"))
  .sort()
  .map((name) => path.join(root, "tests", name));
if (!files.length) throw new Error("No source tests found");
const result = spawnSync(process.execPath, ["--test", ...files], {
  stdio: "inherit",
  cwd: root
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
