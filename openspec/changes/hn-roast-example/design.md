## Context

orinocoflow needs a compelling, zero-friction demo example. The HN roast showcases the library's core HITL mechanic using two free/near-free APIs: the HN Algolia search API (no key) and the Anthropic Messages API (one env var). The example must run as a standalone TypeScript file, handle both the initial run (suspend) and resume in a single script via a `--resume` flag, and also support `oflow simulate` via a mock YAML.

## Goals / Non-Goals

**Goals:**
- Single `.ts` file runnable with `npx tsx examples/hn-roast.ts`
- Resume via `npx tsx examples/hn-roast.ts --resume /tmp/hn-snap.json`
- Snapshot persisted to `/tmp/hn-roast-snap.json` automatically on suspend
- Companion `hn-roast.mock.yaml` for fully offline simulation via `oflow simulate`
- Uses raw `fetch` only — no SDK dependencies beyond what's already in the project
- Clear terminal output: shows the AI draft before suspending, shows "Posted." on resume
- Thoroughly tested

**Non-Goals:**
- Actually posting anywhere (output is printed to stdout — no posting to Bluesky, Discord, etc., keeping zero-friction)
- OAuth or multi-step auth
- Modifying library source code

## Decisions

### Decision: Print-to-stdout rather than actually post
**Chosen:** On resume, the workflow prints the approved post to stdout with a styled "✓ Published:" banner.
**Why:** Zero external accounts needed. The demo is about the workflow mechanic, not the destination. A viewer can trivially imagine "this would be my Discord webhook / Bluesky post / Slack message."
**Alternative considered:** Discord webhook (adds a required setup step; complicates the "zero friction" story).

### Decision: Raw `fetch` for Anthropic API, no SDK
**Chosen:** Call `https://api.anthropic.com/v1/messages` directly with `fetch`.
**Why:** No new runtime dependencies. The project already uses `fetch` (Node 18+). Adding `@anthropic-ai/sdk` just for one example adds package weight.
**Alternative:** `@anthropic-ai/sdk` — cleaner types, but overkill here.

### Decision: Single script handles both `run` and `resume`
**Chosen:** Check `process.argv` for `--resume <path>`. If present, load snapshot and call `resumeWorkflow`. Otherwise run fresh.
**Why:** One command to show in the README. Matches the two-step demo video flow naturally.

### Decision: Snapshot path is fixed at `/tmp/hn-roast-snap.json`
**Chosen:** Always write to `/tmp/hn-roast-snap.json` on suspend.
**Why:** Simplifies the demo — no need to copy-paste a random path between commands.
**Alternative:** Print path and let user pass it — more flexible but noisier for a demo.

### Decision: Workflow graph defined inline in the TypeScript file
**Chosen:** The workflow JSON is a constant in `hn-roast.ts`, not a separate `.yaml` file.
**Why:** Keeps the example self-contained in one file. The `hn-roast.mock.yaml` is the YAML artifact; a second workflow YAML would be redundant.

### Decision: 3-node workflow
```
fetch_story (type: fetch)
     ↓
draft_roast (type: llm)
     ↓
[interrupt]
     ↓
publish (type: output)
```
**Why:** Minimum nodes to tell the full story: fetch → think → gate → act. Any simpler and the workflow graph isn't interesting.

## Risks / Trade-offs

- **Anthropic API key required** → Mitigation: `oflow simulate` with mock YAML works without any key; README documents the env var clearly.
- **HN Algolia returns no results** → Mitigation: handler throws a descriptive error; mock YAML guarantees a story for simulation.
- **`/tmp` not writable on some systems** → Low risk on macOS/Linux for a demo; acceptable trade-off for simplicity.
