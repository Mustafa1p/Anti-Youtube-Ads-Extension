// Dependency-free ZIP writer (stored entries). Excludes Chrome-generated metadata.
const fs = require("node:fs");
const path = require("node:path");
const { root, extension, runtimeFiles } = require("./project.cjs");
const output = path.join(root, "dist", "iptube-browser-extension.zip");

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function collect(directory, relative = "", prefix = "extension") {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const name = path.posix.join(relative, entry.name);
      if (
        entry.name === "_metadata" ||
        entry.name === "none" ||
        name === "rules_1.json"
      )
        return [];
      const fullPath = path.join(directory, entry.name);
      return entry.isDirectory()
        ? collect(fullPath, name, prefix)
        : [{ name: `${prefix}/${name}`, data: fs.readFileSync(fullPath) }];
    });
}

const files = runtimeFiles().map((name) => ({
  name: `extension/${name}`,
  data: fs.readFileSync(path.join(extension, name))
}));
files.push(...collect(path.join(root, "docs"), "", "docs"));
files.push({
  name: "README.md",
  data: fs.readFileSync(path.join(root, "README.md"))
});
files.push({
  name: "LICENSE",
  data: fs.readFileSync(path.join(root, "LICENSE"))
});
for (const name of ["CONTRIBUTING.md", "CHANGELOG.md"]) {
  files.push({ name, data: fs.readFileSync(path.join(root, name)) });
}
const entries = [];
const directory = [];
let offset = 0;
for (const file of files) {
  const name = Buffer.from(file.name);
  const crc = crc32(file.data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6);
  local.writeUInt16LE(0x21, 12); // 1980-01-01, deterministic ZIP timestamp.
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(file.data.length, 18);
  local.writeUInt32LE(file.data.length, 22);
  local.writeUInt16LE(name.length, 26);
  entries.push(local, name, file.data);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(0x21, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(file.data.length, 20);
  central.writeUInt32LE(file.data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(offset, 42);
  directory.push(central, name);
  offset += local.length + name.length + file.data.length;
}
const centralDirectory = Buffer.concat(directory);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralDirectory.length, 12);
end.writeUInt32LE(offset, 16);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, Buffer.concat([...entries, centralDirectory, end]));
console.log(`Packaged ${files.length} files: ${output}`);
