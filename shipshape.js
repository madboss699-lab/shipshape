#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`
SHIPSHAPE — Release Readiness Scanner

Usage:
 shipshape <project-directory> [options]
Options:
  --fail-on-error    Exit with code 1 if errors are found
  --fail-on-warning  Exit with code 1 if errors or warnings are found
  --run-tests        Explicitly run the project's npm test script
  --help, -h         Show this help message

Examples:
  shipshape .\\test-project
  shipshape .\\test-project --fail-on-error
  shipshape .\\test-project --fail-on-warning
`);
  process.exit(0);
}

const root = path.resolve(
  process.argv.slice(2).find(arg => !arg.startsWith("--") && arg !== "-h") || "."
);
const outputDir = process.cwd();

const issues = [];
const ignored = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage"
]);

function report(file, type, message, line = null, fix = "") {
  issues.push({ file, type, message, line, fix });
}

function scanDirectory(dir) {
  let entries;

  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    report(path.relative(root, dir), "ERROR", "Could not read directory");
    return;
  }

  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    const relative = path.relative(root, fullPath);

    if (entry.name === ".env" || /^\.env\..+/.test(entry.name)) {
      report(
        relative,
        "WARNING",
        "Environment file found",
        null,
        "Verify this file is excluded from version control and is not publicly exposed."
      );
      continue;
    }

    if (entry.isDirectory()) {
      scanDirectory(fullPath);
      continue;
    }

    if (!entry.isFile()) continue;

    if (entry.name === "package.json") {
      try {
        const pkg = JSON.parse(fs.readFileSync(fullPath, "utf8"));

        if (!pkg.scripts || Object.keys(pkg.scripts).length === 0) {
          report(
            relative,
            "WARNING",
            "No npm scripts configured",
            null,
            "Add appropriate scripts for running checks or tests."
          );
        }

        if (!pkg.name) {
          report(
            relative,
            "INFO",
            "Package name is missing",
            null,
            "Consider adding a descriptive package name."
          );
        }
      } catch {
        report(
          relative,
          "ERROR",
          "Invalid package.json",
          null,
          "Fix the JSON syntax before running npm commands."
        );
      }
    }

    if (!/\.(js|jsx|ts|tsx|mjs|cjs)$/.test(entry.name)) continue;

    // Do not scan SHIPSHAPE's own implementation or generated reports.
    if (
      path.resolve(fullPath) === path.resolve(__filename) ||
      /^shipshape-report\.(json|html)$/.test(entry.name)
    ) {
      continue;
    }

    let source;

    try {
      source = fs.readFileSync(fullPath, "utf8");
    } catch {
      continue;
    }

    
    // Check common relative imports for missing files.
    const importPatterns = [
      /\bimport\s+(?:[^"'()]*?\s+from\s+)?["'](\.[^"']+)["']/g,
      /\bexport\s+[^"']*?\s+from\s+["'](\.[^"']+)["']/g,
      /\brequire\s*\(\s*["'](\.[^"']+)["']\s*\)/g,
      /\bimport\s*\(\s*["'](\.[^"']+)["']\s*\)/g
    ];

    const extensions = [
      "",
      ".js",
      ".jsx",
      ".ts",
      ".tsx",
      ".mjs",
      ".cjs",
      ".json"
    ];

    function importExists(importPath) {
      const base = path.resolve(path.dirname(fullPath), importPath);

      // Check files such as ./helper.js and extensionless ./helper.
      for (const ext of extensions) {
        if (fs.existsSync(base + ext)) return true;
      }

      // Check common directory entry points.
      if (fs.existsSync(base) && fs.statSync(base).isDirectory()) {
        for (const name of [
          "index.js",
          "index.jsx",
          "index.ts",
          "index.tsx",
          "index.mjs",
          "index.cjs",
          "index.json"
        ]) {
          if (fs.existsSync(path.join(base, name))) return true;
        }
      }

      return false;
    }

    for (const pattern of importPatterns) {
      pattern.lastIndex = 0;
      let match;

      while ((match = pattern.exec(source)) !== null) {
        const importPath = match[1];

        if (!importExists(importPath)) {
          const line = source.slice(0, match.index).split(/\r?\n/).length;

          report(
            relative,
            "WARNING",
            `Possible missing relative import: ${importPath}`,
            line,
            "Check the path, filename spelling, and file extension."
          );
        }
      }
    }
    const lines = source.split(/\r?\n/);

    lines.forEach((line, index) => {
      if (/\b(TODO|FIXME)\b/i.test(line)) {
        report(
          relative,
          "INFO",
          "TODO/FIXME marker found",
          index + 1,
          "Review whether the unfinished task needs to be resolved before release."
        );
      }

      if (
        /(api[_-]?key|secret|password|token)\s*[:=]\s*["'][^"']{8,}["']/i.test(line)
      ) {
        report(
          relative,
          "WARNING",
          "Possible hardcoded secret",
          index + 1,
          "Verify the value. If it is a real credential, revoke it if exposed and use secure configuration."
        );
      }
    });
  }
}

function runProjectTests() {
  const packagePath = path.join(root, "package.json");

  if (!fs.existsSync(packagePath)) {
    return {
      status: "SKIPPED",
      message: "No package.json found."
    };
  }

  let pkg;

  try {
    pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  } catch {
    return {
      status: "SKIPPED",
      message: "Could not read package.json."
    };
  }

  if (!pkg.scripts || !pkg.scripts.test) {
    return {
      status: "SKIPPED",
      message: "No test script configured."
    };
  }

  if (!process.argv.includes("--run-tests")) {
    return {
      status: "NOT_RUN",
      message: "Tests were not run. Use --run-tests to execute them."
    };
  }

  const isWindows = process.platform === "win32";

  const result = spawnSync(
    isWindows ? "cmd.exe" : "npm",
    isWindows ? ["/d", "/s", "/c", "npm test"] : ["test"],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 120000,
      windowsHide: true,
      shell: false
    }
  );

  if (result.error) {
    return {
      status: result.error.code === "ETIMEDOUT" ? "TIMEOUT" : "ERROR",
      message: result.error.code === "ETIMEDOUT"
        ? "Tests exceeded the 120-second timeout."
        : `Could not run tests: ${result.error.message}`
    };
  }

  return {
    status: result.status === 0 ? "PASSED" : "FAILED",
    message: result.status === 0
      ? "The npm test command completed successfully."
      : `The npm test command failed with exit code ${result.status}.`
  };
}





function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function createHtmlReport() {
  const counts = {
    ERROR: issues.filter(x => x.type === "ERROR").length,
    WARNING: issues.filter(x => x.type === "WARNING").length,
    INFO: issues.filter(x => x.type === "INFO").length
  };
  const testStatus = result.testResult || {
  status: "NOT AVAILABLE",
  message: "Test status has not been recorded."
};
const verdict =
  counts.ERROR > 0 || counts.WARNING > 0
    ? {
        label: "NEEDS ATTENTION",
        className: counts.ERROR > 0 ? "error" : "warning",
        message: "Errors or warnings were detected. Review the findings before release."
      }
    : ["FAILED", "ERROR", "TIMEOUT"].includes(testStatus.status)
    ? {
        label: "NEEDS ATTENTION",
        className: "error",
        message: "Project tests failed or could not be completed. Investigate before release."
      }
    : testStatus.status === "PASSED"
    ? {
        label: "READY FOR REVIEW",
        className: "info",
        message: "No errors or warnings were detected, and tests are marked as passed. This does not guarantee the project is bug-free."
      }
    : {
        label: "REVIEW",
        className: "info",
        message: "No errors or warnings were detected, but tests have not been confirmed as passed."
      };


  const rows = issues.length
    ? issues.map(issue => `
      <article class="issue">
        <div class="issue-top">
          <span class="tag ${issue.type.toLowerCase()}">${escapeHtml(issue.type)}</span>
          <span class="location">${escapeHtml(issue.file)}${issue.line ? ` : line ${issue.line}` : ""}</span>
        </div>
        <h3>${escapeHtml(issue.message)}</h3>
        <p>${escapeHtml(issue.fix || "Review this finding manually.")}</p>
      </article>
    `).join("")
    : `<div class="empty"><h2>No findings detected</h2><p>This does not guarantee that the project is free of defects or security issues.</p></div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SHIPSHAPE — Release Readiness Report</title>
<style>
:root { color-scheme: dark; font-family: Inter, system-ui, sans-serif; }
* { box-sizing: border-box; }
body { margin: 0; background: #0c111b; color: #eef2ff; }
main { max-width: 920px; margin: 0 auto; padding: 40px 20px 70px; }
header { padding: 28px; border: 1px solid #273449; border-radius: 20px; background: #121b2a; }
.brand { color: #7dd3fc; font-size: 13px; letter-spacing: 3px; font-weight: 800; }
h1 { font-size: clamp(28px, 5vw, 42px); margin: 12px 0; }
.muted { color: #aab7cc; line-height: 1.6; overflow-wrap: anywhere; }
.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 18px 0 30px; }
.stat, .issue, .empty { background: #121b2a; border: 1px solid #273449; border-radius: 14px; padding: 18px; }
.stat strong { display: block; font-size: 28px; margin-top: 6px; }
.stat span { color: #aab7cc; font-size: 13px; }
section h2 { font-size: 22px; }
.issue { margin: 12px 0; }
.issue-top { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
.tag { font-size: 11px; font-weight: 800; letter-spacing: 1px; padding: 6px 9px; border-radius: 6px; }
.warning { background: #422b13; color: #fbbf24; }
.error { background: #451e28; color: #fda4af; }
.info { background: #18354b; color: #7dd3fc; }
.location { color: #aab7cc; font-size: 12px; overflow-wrap: anywhere; }
.issue h3 { font-size: 17px; margin-bottom: 8px; }
.issue p, .empty p { color: #aab7cc; line-height: 1.6; margin-bottom: 0; }
footer { margin-top: 28px; color: #8190a7; font-size: 12px; line-height: 1.7; }
@media (max-width: 520px) { main { padding: 18px 12px; } .stats { gap: 7px; } .stat { padding: 12px 8px; } .stat strong { font-size: 22px; } }
</style>
</head>
<body>
<main>
<header>
  <div class="brand">SHIPSHAPE / DEVELOPER TOOLS</div>
  <h1>Release Readiness Report</h1>
  <p class="muted">Project: ${escapeHtml(root)}</p>
  <p class="muted">Generated: ${escapeHtml(new Date().toLocaleString())}</p>
</header>
<section>
  <h2>Release Verdict</h2>
  <article class="issue">
    <div class="issue-top">
      <span class="tag ${verdict.className}">${escapeHtml(verdict.label)}</span>
    </div>
    <p>
  ${counts.ERROR} errors · ${counts.WARNING} warnings · ${counts.INFO} info</p>
    <p>${escapeHtml(verdict.message)}</p>
  </article>
</section>
<div class="stats">
  <div class="stat"><span>ERRORS</span><strong>${counts.ERROR}</strong></div>
  <div class="stat"><span>WARNINGS</span><strong>${counts.WARNING}</strong></div>
  <div class="stat"><span>INFO</span><strong>${counts.INFO}</strong></div>
</div>
<section>
  <h2>Test Status</h2>
  <article class="issue">
    <div class="issue-top">
      <span class="tag info">${escapeHtml(testStatus.status)}</span>
    </div>
    <p>${escapeHtml(testStatus.message)}</p>
  </article>
</section>
<section>
<h2>Findings (${issues.length})</h2>
${rows}
</section>
<footer>SHIPSHAPE is an early-stage heuristic scanner. Findings may be false positives, and a clean report does not certify that a project is safe or ready to release. Always review results and run appropriate tests.</footer>
</main>
</body>
</html>`;
}

if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
  console.error("Error: provide a valid project directory.");
  process.exit(1);
}

scanDirectory(root);
const testResult = runProjectTests();

const result = {
  tool: "SHIPSHAPE",
  scannedDirectory: root,
  scannedAt: new Date().toISOString(),
  testResult,
  issueCount: issues.length,
  counts: {
    ERROR: issues.filter(x => x.type === "ERROR").length,
    WARNING: issues.filter(x => x.type === "WARNING").length,
    INFO: issues.filter(x => x.type === "INFO").length
  },

  issues
};



fs.writeFileSync(
  path.join(outputDir, "shipshape-report.json"),
  JSON.stringify(result, null, 2),
  "utf8"
);

fs.writeFileSync(
  path.join(outputDir, "shipshape-report.html"),
  createHtmlReport(),
  "utf8"
);

console.log("\nSHIPSHAPE — Release Readiness Scan");
console.log("----------------------------------");
console.log(`Project: ${root}`);
console.log(`Findings: ${issues.length}`);
console.log(`Errors: ${result.counts.ERROR} | Warnings: ${result.counts.WARNING} | Info: ${result.counts.INFO}`);

for (const issue of issues) {
  const line = issue.line ? ` (line ${issue.line})` : "";
  console.log(`[${issue.type}] ${issue.file}${line}: ${issue.message}`);
}

console.log("\nReports generated:");
console.log(`JSON: ${path.join(outputDir, "shipshape-report.json")}`);
console.log(`HTML: ${path.join(outputDir, "shipshape-report.html")}`);
const failOnError = process.argv.includes("--fail-on-error");
const failOnWarning = process.argv.includes("--fail-on-warning");

if (
  (failOnError && result.counts.ERROR > 0) ||
  (failOnWarning &&
    (result.counts.ERROR > 0 || result.counts.WARNING > 0))
) {
  process.exitCode = 1;
}