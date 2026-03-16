## ADDED Requirements

### Requirement: Initial run fetches HN story and suspends for human approval
Running `npx tsx examples/hn-roast.ts` (without `--resume`) SHALL fetch the current #1 Hacker News story via the HN Algolia API, call the Anthropic Messages API to generate a roast, run the workflow until the `interrupt` node, write the snapshot to `/tmp/hn-roast-snap.json`, print the AI draft to stdout, and exit with a message instructing the user to run with `--resume` to approve.

#### Scenario: Successful initial run
- **WHEN** the script is invoked without `--resume` and `ANTHROPIC_API_KEY` is set
- **THEN** the terminal prints the fetched story title, then the AI draft, then a suspended status message with resume instructions
- **THEN** `/tmp/hn-roast-snap.json` is written and contains a valid serializable snapshot

#### Scenario: Missing API key
- **WHEN** `ANTHROPIC_API_KEY` is not set
- **THEN** the script exits with a clear error message before making any API calls

### Requirement: Resume approves and outputs the post
Running `npx tsx examples/hn-roast.ts --resume /tmp/hn-roast-snap.json` SHALL load the snapshot, call `resumeWorkflow`, execute the `publish` node, and print the approved post to stdout with a `✓ Published:` prefix.

#### Scenario: Successful resume
- **WHEN** the script is invoked with `--resume <path>` and the snapshot file exists
- **THEN** the terminal prints `✓ Published:` followed by the approved post text
- **THEN** the workflow completes with `status: "completed"`

#### Scenario: Missing snapshot file
- **WHEN** the script is invoked with `--resume <path>` and the file does not exist
- **THEN** the script exits with a descriptive error message

### Requirement: Offline simulation via mock YAML
`oflow simulate examples/hn-roast.yaml examples/hn-roast.mock.yaml` SHALL run the workflow to completion using mock handler data, without making any network calls, and print the workflow trace to stdout.

#### Scenario: Simulate runs without API keys
- **WHEN** `oflow simulate` is invoked with the workflow and mock YAML
- **THEN** the simulation completes successfully and prints each node execution
- **THEN** no network requests are made

### Requirement: Workflow graph is a valid 3-node orinocoflow graph
The workflow SHALL define nodes `fetch_story`, `draft_roast`, `wait_for_approval` (type: `interrupt`), and `publish`, connected by standard edges in that order.

#### Scenario: Graph parses without error
- **WHEN** the workflow definition is passed to `parse()`
- **THEN** no `WorkflowConfigurationError` is thrown
- **THEN** the parsed graph has exactly 4 nodes and 3 edges

#### Scenario: Workflow suspends at interrupt node
- **WHEN** `runWorkflow` is called with stub handlers
- **THEN** the result has `status: "suspended"` and `snapshot.suspendedAtNodeId === "wait_for_approval"`

#### Scenario: Workflow completes after resume
- **WHEN** `resumeWorkflow` is called with a valid snapshot and stub handlers
- **THEN** the result has `status: "completed"`
