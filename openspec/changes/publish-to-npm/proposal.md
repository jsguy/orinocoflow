## Why

orinocoflow is a complete, tested workflow engine but is not yet available on NPM. Publishing it makes it installable via `npm install orinocoflow` and `bun add orinocoflow`, enabling the community to use it in Node and Bun projects without cloning the repo.

## What Changes

- Publish the package to the NPM registry under the name `orinocoflow`
- Set up an NPM organisation/account and configure publish credentials
- Add `.npmrc` and NPM token configuration for CI publishing
- Verify package contents via `npm pack --dry-run` before first publish
- Tag the initial release (`v0.1.0`) in git

## Capabilities

### New Capabilities

- `npm-publish`: End-to-end process for publishing the package to NPM — account setup, authentication, pack verification, and `npm publish`

### Modified Capabilities

<!-- None — the package metadata and build were already addressed in a prior change. No spec-level requirement changes. -->

## Impact

- **package.json**: Already correct (`bin`, `files`, `engines`, `exports`, `prepublishOnly`) — no further code changes expected
- **dist/**: Already built and committed — `prepublishOnly` will rebuild fresh on publish
- **External**: Creates a public NPM record at `npmjs.com/package/orinocoflow`
- **No API changes**: Library surface is unchanged
