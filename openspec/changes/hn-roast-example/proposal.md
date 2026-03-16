## Why

The existing examples (ODT pipeline, PR pipeline) are abstract CI/CD patterns that require explanation. We need a self-contained, zero-API-key example that any developer can run in 60 seconds that immediately demonstrates orinocoflow's HITL suspend/resume mechanic in an entertaining, real-world context.

## What Changes

- **New file** `examples/hn-roast.ts` — a runnable TypeScript example that fetches the current #1 HN story + top comments, uses Claude to generate a spicy hot take, suspends for human approval, then prints the approved post
- **New file** `examples/hn-roast.mock.yaml` — mock data for running the example without any API keys via `oflow simulate`
- README section updated to document the new example

## Capabilities

### New Capabilities
- `hn-roast-example`: A 3-node workflow (`fetch → draft → [interrupt] → output`) that demonstrates HITL suspend/resume with real external API calls (HN Algolia API — no key; Anthropic API — one env var) and zero-setup simulation via mock file

### Modified Capabilities
<!-- none -->

## Impact

- New file: `examples/hn-roast.ts`
- New file: `examples/hn-roast.mock.yaml`
- README.md: add "Run the HN roast example" section
- New dependency: `@anthropic-ai/sdk` (or raw `fetch` to Anthropic Messages API — TBD in design)
- No changes to library source code
