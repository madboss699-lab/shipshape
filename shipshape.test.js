
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const scanner = path.join(__dirname, "shipshape.js");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "shipshape-test-"));

try {
  // Test 1: Help command works.
  const help = spawnSync(
    process.execPath,
    [scanner, "--help"],
    { encoding: "utf8" }
  );

  assert.equal(help.status, 0, "Help command should succeed");
  


  // Test 2: Scanner detects known issues.
  const project = path.join(tempDir, "sample-project");
  fs.mkdirSync(project);

  fs.writeFileSync(
    path.join(project, "app.js"),
    [
      "// TODO: fix before release",
      'const apiKey = "example_secret_key_12345";',
      'const missing = require("./this-file-does-not-exist");'
    ].join("\n")
  );

  fs.writeFileSync(
    path.join(project, "package.json"),
    JSON.stringify({ name: "sample-project", version: "1.0.0" })
  );

  const scan = spawnSync(
    process.execPath,
    [scanner, project],
    { encoding: "utf8" }
  );

  assert.equal(scan.status, 0, "Normal scan should succeed");
  assert.match(scan.stdout, /missing relative import/i);
  assert.match(scan.stdout, /TODO\/FIXME/i);
  assert.match(scan.stdout, /hardcoded secret/i);
  assert.match(scan.stdout, /Findings: 4/, "Expected four findings");

  // Test 3: Warning threshold returns exit code 1.
  const strictScan = spawnSync(
    process.execPath,
    [scanner, project, "--fail-on-warning"],
    { encoding: "utf8" }
  );

  assert.equal(strictScan.status, 1, "Warnings should fail strict scan");

  console.log("PASS: help command");
  console.log("PASS: known issue detection");
  console.log("PASS: fail-on-warning exit code");
  console.log("\nAll SHIPSHAPE regression tests passed.");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
