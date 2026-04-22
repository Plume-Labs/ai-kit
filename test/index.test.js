const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("index.js forwards to dist/index.js", () => {
  const entryPath = path.join(__dirname, "..", "index.js");
  const content = fs.readFileSync(entryPath, "utf8");

  assert.match(content, /module\.exports\s*=\s*require\(["']\.\/dist\/index\.js["']\)/);
});

test("build output contains dist/index.js", () => {
  const distEntryPath = path.join(__dirname, "..", "dist", "index.js");
  assert.equal(fs.existsSync(distEntryPath), true);
});
