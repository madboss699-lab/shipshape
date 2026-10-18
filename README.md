# SHIPSHAPE

**A lightweight release-readiness scanner for JavaScript projects.**

SHIPSHAPE checks JavaScript projects for potential issues and generates JSON and HTML reports to help developers review their code before release.

## Features

- Detects TODO/FIXME markers.
- Flags patterns that may indicate hardcoded secrets.
- Checks whether relative import paths appear to resolve.
- Checks `package.json` validity and selected common configuration issues.
- Can optionally run the project's configured npm test script.
- Generates JSON and HTML reports.
- Supports CI-friendly exit codes.

## Requirements

- Node.js 18 or later.
- npm for installation and for running project tests.

## Install from a local package

Run this from the folder containing `shipshape-1.0.0.tgz`, or provide its full path:

```bash
npm install -g ./shipshape-1.0.0.tgz
```

On Windows PowerShell, if execution policy blocks the `shipshape.ps1` shim, try:

```powershell
shipshape.cmd --help
```

## Usage

Scan a project:

```bash
shipshape ./my-project
```

Exit with code 1 if warnings or errors are found:

```bash
shipshape ./my-project --fail-on-warning
```

Run the target project's configured npm test script:

```bash
shipshape ./my-project --run-tests
```

View available options:

```bash
shipshape --help
```

## Options

| Option | Description |
|---|---|
| `--help`, `-h` | Display help |
| `--fail-on-error` | Exit with code 1 if errors are found |
| `--fail-on-warning` | Exit with code 1 if errors or warnings are found |
| `--run-tests` | Explicitly run the project's npm test script |

## Reports

SHIPSHAPE generates:

- `shipshape-report.json`
- `shipshape-report.html`

Reports are written to the **current working directory**—the directory from which you run SHIPSHAPE—not necessarily the project being scanned.

## Important limitations

SHIPSHAPE uses heuristic checks. Findings may be false positives, and a clean scan does not guarantee that a project is secure, bug-free, or ready for release.

Review findings and run appropriate tests independently. Only use `--run-tests` when you intend to execute the target project's configured test command; project scripts can execute arbitrary code.

## Current status

SHIPSHAPE is an early-stage project. Independent testing and feedback are needed before relying on it in production.
