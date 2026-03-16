## ADDED Requirements

### Requirement: Package name is available on NPM
Before publishing, the publisher SHALL verify that the `orinocoflow` package name is not already claimed on the NPM registry.

#### Scenario: Name is available
- **WHEN** the publisher runs `npm info orinocoflow`
- **THEN** the command returns a 404 / "not found" error, confirming the name is free

---

### Requirement: Pack contents match the files whitelist
The published tarball SHALL contain only `dist/` and `README.md`, as declared in `package.json#files`.

#### Scenario: Dry-run shows only expected files
- **WHEN** the publisher runs `npm pack --dry-run`
- **THEN** every listed file is under `dist/` or is `README.md`
- **AND** no source files (`src/`, `tests/`, `openspec/`) appear in the listing

#### Scenario: Tarball extraction confirms contents
- **WHEN** the publisher runs `npm pack` and extracts the resulting `.tgz`
- **THEN** the extracted tree contains `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts`, `dist/cli/index.js`, and `README.md`
- **AND** no unintended files are present

---

### Requirement: Library is importable after install
After publishing, a consumer SHALL be able to install and use the library from the NPM registry.

#### Scenario: ESM import resolves core exports
- **WHEN** a consumer runs `npm install orinocoflow` in a Node 18+ project
- **AND** runs `node -e "import('orinocoflow').then(m => console.log(Object.keys(m)))"`
- **THEN** the output includes `runWorkflow`, `parse`, and `resumeWorkflow`

#### Scenario: CJS require resolves core exports
- **WHEN** a consumer runs `const m = require('orinocoflow')`
- **THEN** `m.runWorkflow` is a function

---

### Requirement: CLI binary is executable after install
After installing the package globally or running via npx, the `oflow` binary SHALL be available and functional.

#### Scenario: oflow binary runs via npx
- **WHEN** a consumer runs `npx orinocoflow compile <workflow.yaml>`
- **THEN** the command executes without error and prints compiled JSON

#### Scenario: Global install exposes oflow command
- **WHEN** a consumer runs `npm install -g orinocoflow`
- **THEN** `oflow --help` (or `oflow` with no args) prints usage instructions

---

### Requirement: Release is tagged in git
The published version SHALL have a corresponding git tag so the exact published source is traceable.

#### Scenario: Tag exists after publish
- **WHEN** the publisher runs `git tag v0.1.0 && git push origin v0.1.0`
- **THEN** `git tag -l "v0.1.0"` returns `v0.1.0`
- **AND** the tag is visible on the remote repository
