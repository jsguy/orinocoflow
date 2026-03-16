## 1. Pre-publish Verification

- [x] 1.1 Run `npm info orinocoflow` and confirm the name returns 404 (not taken)
- [x] 1.2 Run `npm pack --dry-run` and verify only `dist/` files and `README.md` are listed
- [x] 1.3 Run `npm pack`, extract the tarball, and confirm `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts`, `dist/cli/index.js` are present
- [x] 1.4 Smoke-test the library: `node -e "import('./dist/index.js').then(m => console.log(Object.keys(m)))"`
- [x] 1.5 Smoke-test the CLI: `node dist/cli/index.js compile examples/odt-pipeline.yaml`
- [x] 1.6 Delete the local `.tgz` produced by `npm pack`

## 2. NPM Account Setup

- [ ] 2.1 Create an NPM account at `npmjs.com` (or confirm an existing account has publish rights)
- [ ] 2.2 Enable 2FA on the NPM account and store recovery codes securely
- [ ] 2.3 Run `npm login` locally and confirm authentication with `npm whoami`

## 3. Publish

- [ ] 3.1 Run `npm publish` (this triggers `prepublishOnly` → `bun run build` first)
- [ ] 3.2 Verify the package is live: `npm info orinocoflow`
- [ ] 3.3 Confirm the published package page is visible at `npmjs.com/package/orinocoflow`

## 4. Post-publish

- [ ] 4.1 Install from registry and verify ESM import: `npm install orinocoflow` in a temp dir, run `node -e "import('orinocoflow').then(m => console.log(m.runWorkflow))"`
- [ ] 4.2 Test the CLI via npx: `npx orinocoflow compile examples/odt-pipeline.yaml`
- [ ] 4.3 Tag the release in git: `git tag v0.1.0 && git push origin v0.1.0`
