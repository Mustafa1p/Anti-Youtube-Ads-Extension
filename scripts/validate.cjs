const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const { root, extension, readJson, runtimeFiles } = require("./project.cjs");

const manifest = readJson("extension/manifest.json");
const metadata = readJson("package.json");
assert.equal(manifest.manifest_version, 3);
assert.equal(
  metadata.version,
  manifest.version,
  "Keep package and extension versions in sync"
);
assert.equal(metadata.license, "MIT");
const files = runtimeFiles();
for (const directory of ["scripts", "tests"]) {
  for (const name of fs.readdirSync(path.join(root, directory))) {
    if (/\.(?:cjs|js)$/.test(name))
      new vm.Script(fs.readFileSync(path.join(root, directory, name), "utf8"), {
        filename: `${directory}/${name}`
      });
  }
}
for (const file of files) {
  assert.ok(
    !file.startsWith("_metadata/") && !file.startsWith("."),
    `Unexpected runtime file: ${file}`
  );
  if (file.endsWith(".js"))
    new vm.Script(fs.readFileSync(path.join(extension, file), "utf8"), {
      filename: file
    });
  if (file.endsWith(".json"))
    JSON.parse(fs.readFileSync(path.join(extension, file), "utf8"));
}
const ids = new Set();
for (const resource of manifest.declarative_net_request.rule_resources) {
  const rules = readJson(`extension/${resource.path}`);
  assert.ok(Array.isArray(rules));
  for (const rule of rules) {
    assert.ok(
      Number.isInteger(rule.id) && rule.id > 0 && !ids.has(rule.id),
      `Invalid or duplicate rule ID: ${rule.id}`
    );
    assert.ok(rule.action && rule.condition, `Incomplete rule: ${rule.id}`);
    if (rule.priority !== undefined)
      assert.ok(Number.isInteger(rule.priority) && rule.priority > 0);
    ids.add(rule.id);
  }
}
for (const file of [
  "README.md",
  "CONTRIBUTING.md",
  "CHANGELOG.md",
  "docs/assets.md",
  "docs/releasing.md"
]) {
  assert.ok(
    fs.existsSync(path.join(root, file)),
    `Missing project documentation: ${file}`
  );
}
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
for (const match of readme.matchAll(
  /(?:!\[[^\]]*\]\(|src=")(docs\/[^)" ]+)/g
)) {
  assert.ok(
    fs.existsSync(path.join(root, match[1])),
    `Missing README image: ${match[1]}`
  );
}
console.log(
  `Validated v${manifest.version}: ${files.length} runtime files, ${ids.size} network rules, and project documentation.`
);
