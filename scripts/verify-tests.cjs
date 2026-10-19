// Prove important tests detect deliberately broken production code in temporary copies.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const assert = require("node:assert/strict");
const { root } = require("./project.cjs");

const cases = [
  {
    name: "lost concurrent counter updates",
    file: "background.js",
    from: "pendingCountOperation.then(operation)",
    to: "Promise.resolve().then(operation)",
    testFile: "extension.test.cjs",
    testName: "concurrent requests do not lose blocked-count increments"
  },
  {
    name: "SponsorBlock ignores the saved opt-in",
    file: "sponsorBlockService.js",
    from: "if (!settings.sponsorBlock || !categories.length) return [];",
    to: "if (!categories.length) return [];",
    testFile: "features.test.cjs",
    testName:
      "SponsorBlock is opt in and rejects invalid video IDs before networking"
  },
  {
    name: "stale responses affect the next video",
    file: "browserFeatures.js",
    from: "if (!active || requestGeneration !== generation) return;",
    to: "if (!active) return;",
    testFile: "features.test.cjs",
    testName:
      "segment skipping merges overlaps, ignores ads, and discards stale navigation responses"
  }
];

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "iptube-tests-"));
try {
  for (const [index, mutation] of cases.entries()) {
    const directory = path.join(temporaryRoot, String(index));
    fs.cpSync(path.join(root, "extension"), path.join(directory, "extension"), {
      recursive: true
    });
    fs.cpSync(path.join(root, "tests"), path.join(directory, "tests"), {
      recursive: true
    });
    const target = path.join(directory, "extension", mutation.file);
    const original = fs.readFileSync(target, "utf8");
    assert.ok(
      original.includes(mutation.from),
      `Mutation target changed: ${mutation.file}`
    );
    fs.writeFileSync(target, original.replace(mutation.from, mutation.to));
    const result = spawnSync(
      process.execPath,
      [
        "--test",
        "--test-reporter=tap",
        `--test-name-pattern=${mutation.testName}`,
        path.join(directory, "tests", mutation.testFile)
      ],
      { encoding: "utf8", timeout: 15000 }
    );
    if (result.error) throw result.error;
    assert.notEqual(
      result.status,
      0,
      `A regression escaped the test: ${mutation.name}`
    );
    assert.ok(
      result.stdout.includes("ERR_ASSERTION") &&
        result.stdout.includes(mutation.testName),
      `Failure was not the expected assertion: ${mutation.name}\n${result.stdout}\n${result.stderr}`
    );
    console.log(`Detected regression: ${mutation.name}`);
  }
} finally {
  // Verify the exact temporary directory before recursive cleanup on every OS.
  assert.equal(
    path.dirname(path.resolve(temporaryRoot)),
    path.resolve(os.tmpdir())
  );
  assert.ok(path.basename(temporaryRoot).startsWith("iptube-tests-"));
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
console.log(
  "All 3 deliberately introduced regressions were caught. Production files were unchanged."
);
