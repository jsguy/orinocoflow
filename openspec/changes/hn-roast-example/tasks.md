## 1. Workflow Definition

- [x] 1.1 Define the 4-node workflow graph as a TypeScript constant in `examples/hn-roast.ts` (nodes: `fetch_story`, `draft_roast`, `wait_for_approval` [type: interrupt], `publish`)
- [x] 1.2 Verify the graph parses with `parse()` and throws no `WorkflowConfigurationError`

## 2. Handlers

- [x] 2.1 Implement `fetch_story` handler — call `https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=1` and top comments endpoint, merge title + top 5 comment texts into state
- [x] 2.2 Implement `draft_roast` handler — POST to `https://api.anthropic.com/v1/messages` using raw `fetch` with `ANTHROPIC_API_KEY`, return AI-generated roast in state
- [x] 2.3 Implement `publish` handler — print `✓ Published:\n<roast>` to stdout, return state

## 3. Run / Resume CLI Logic

- [x] 3.1 Implement initial run path: call `runWorkflow`, on `status === "suspended"` write snapshot to `/tmp/hn-roast-snap.json`, print the draft from state, print resume instructions
- [x] 3.2 Implement `--resume <path>` path: read snapshot JSON from disk, call `resumeWorkflow`, run to completion
- [x] 3.3 Add guard: if `ANTHROPIC_API_KEY` is not set and not in resume mode, print error and exit(1)
- [x] 3.4 Add guard: if `--resume` path does not exist, print error and exit(1)

## 4. Mock YAML

- [x] 4.1 Create `examples/hn-roast.mock.yaml` with handler responses for all 4 nodes (use static story title, static roast text) so `oflow simulate` runs offline

## 5. Tests

- [x] 5.1 Write a Vitest test that parses the workflow graph and asserts 4 nodes and 3 edges with no parse error
- [x] 5.2 Write a Vitest test that runs the workflow with stub handlers and asserts `status === "suspended"` at `wait_for_approval`
- [x] 5.3 Write a Vitest test that resumes from a captured snapshot with stub handlers and asserts `status === "completed"`
- [x] 5.4 Write a Vitest test that round-trips the snapshot through JSON serialization (`JSON.stringify` → `JSON.parse`) and confirms resume still completes

## 6. README

- [x] 6.1 Add a "HN Roast example" section to README.md documenting both the simulate command (no keys needed) and the real run/resume commands (requires `ANTHROPIC_API_KEY`)
