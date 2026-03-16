## Context

orinocoflow already has a correct `package.json` (dual ESM/CJS exports, `bin`, `files`, `engines`, `prepublishOnly`) and a working build. The dist artifacts are committed. The remaining work is entirely operational: create an NPM account/org, authenticate, verify pack contents, and publish.

## Goals / Non-Goals

**Goals:**
- Publish `orinocoflow@0.1.0` to the public NPM registry
- Establish a repeatable, documented publish workflow for future releases
- Tag `v0.1.0` in git so the release is traceable

**Non-Goals:**
- Automated CI publishing (GitHub Actions release workflow) — manual publish for v0.1.0
- Scoped package (`@org/orinocoflow`) — publishing under the unscoped name `orinocoflow`
- Changelog or release notes tooling — out of scope for first publish

## Decisions

### 1. Manual publish for v0.1.0

**Decision:** Run `npm publish` locally for the first release rather than setting up CI automation.

**Rationale:** CI automation (NPM token in GitHub Secrets, release workflow) adds setup overhead disproportionate to a first publish. A manual publish can be verified interactively. CI automation is a good follow-up once the package is live.

**Alternative considered:** GitHub Actions `release` workflow with `NPM_TOKEN` secret — deferred to a future change.

---

### 2. Unscoped package name `orinocoflow`

**Decision:** Publish as `orinocoflow`, not `@org/orinocoflow`.

**Rationale:** Simpler install command (`npm install orinocoflow`), no org creation required. An NPM org can be added later if needed without breaking existing installs (scoped packages are a different namespace).

---

### 3. `prepublishOnly` rebuilds dist on every publish

**Decision:** Keep `"prepublishOnly": "bun run build"` in `package.json`.

**Rationale:** Guarantees dist is always fresh and built from current source at publish time. Prevents accidentally shipping a stale dist. Requires Bun to be available on the publishing machine, which is acceptable for a manual workflow.

## Risks / Trade-offs

- **Name squatting** → Check `npmjs.com/package/orinocoflow` before proceeding; if taken, choose an alternative name before doing anything else.
- **Bun required to publish** → `prepublishOnly` calls `bun run build`. Publishing machine must have Bun installed. Mitigation: document this requirement; it's already a dev dependency.
- **No 2FA recovery codes stored** → If the NPM account uses 2FA (recommended), recovery codes must be saved securely. Mitigation: use a password manager.
- **v0.1.0 cannot be unpublished after 72 hours** → NPM's unpublish policy means a bad first publish is sticky. Mitigation: run `npm pack --dry-run` and smoke-test the tarball before publishing.

## Migration Plan

1. Check the `orinocoflow` name is available on NPM
2. Create NPM account (or use existing) — enable 2FA
3. Run `npm login` locally
4. Run `npm pack --dry-run` — verify only `dist/` and `README.md` are included
5. Extract and smoke-test the tarball: `npm pack && tar -tzf orinocoflow-0.1.0.tgz`
6. Run `npm publish`
7. Verify: `npm info orinocoflow`
8. Tag the release: `git tag v0.1.0 && git push origin v0.1.0`
9. Clean up local tarball: `rm orinocoflow-0.1.0.tgz`

**Rollback:** `npm unpublish orinocoflow@0.1.0` (available within 72 hours of publish).
