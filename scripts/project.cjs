const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const root = path.join(__dirname, "..");
const extension = path.join(root, "extension");

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
}

function runtimeFiles() {
  const manifest = readJson("extension/manifest.json");
  const files = new Set();
  function add(name) {
    assert.equal(typeof name, "string", "Manifest paths must be strings");
    assert.ok(
      !name.includes("\\") &&
        !name.includes("*") &&
        !path.posix.isAbsolute(name),
      `Unsupported path: ${name}`
    );
    const normalized = path.posix.normalize(name);
    assert.ok(
      normalized !== ".." && !normalized.startsWith("../"),
      `Path escapes extension: ${name}`
    );
    if (files.has(normalized)) return;
    const fullPath = path.join(extension, normalized);
    assert.ok(fs.statSync(fullPath).isFile(), `Missing runtime file: ${name}`);
    files.add(normalized);
    const relative = (target) =>
      path.posix.join(path.posix.dirname(normalized), target);
    if (normalized.endsWith(".html")) {
      const html = fs.readFileSync(fullPath, "utf8");
      for (const match of html.matchAll(
        /<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["']/g
      ))
        add(relative(match[1]));
    }
    if (normalized.endsWith(".js")) {
      const script = fs.readFileSync(fullPath, "utf8");
      for (const match of script.matchAll(/\bimportScripts\(([^)]+)\)/g)) {
        for (const argument of match[1].matchAll(/["']([^"']+)["']/g))
          add(relative(argument[1]));
      }
    }
  }
  add("manifest.json");
  add(manifest.background.service_worker);
  add(manifest.action.default_popup);
  for (const entry of manifest.content_scripts) {
    for (const name of [...(entry.js || []), ...(entry.css || [])]) add(name);
  }
  for (const entry of manifest.web_accessible_resources)
    for (const name of entry.resources) add(name);
  for (const entry of manifest.declarative_net_request.rule_resources)
    add(entry.path);
  return [...files].sort();
}

module.exports = { root, extension, readJson, runtimeFiles };
