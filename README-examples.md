# Examples catalog

Runnable samples live under [`examples/`](examples/) in the **git repository** — clone the repo to run them; the npm package includes this file for documentation but **does not ship** the `examples/` tree. From a clone, **`cwd` at the repo root** and `npm install` unless noted.

See the main [README](README.md) for install, schema, API, and short illustrative snippets.

---

## Human-in-the-loop pattern

End-to-end: define a workflow with an **`interrupt`** node, run once (suspends), persist `snapshot`, then **`resumeWorkflow`** with extra state.

```ts
import { parse, runWorkflow, resumeWorkflow, MemorySessionStore } from "orinocoflow";
import type { WorkflowNode, WorkflowState } from "orinocoflow";

const handlers: Record<
  string,
  (node: WorkflowNode, state: WorkflowState) => Promise<WorkflowState>
> = {
  llm: async (_n, s) => s,
  local_script: async (_n, s) => s,
};

const sessions = new MemorySessionStore();

const workflow = parse({
  orinocoflow_version: "1.0",
  graph_id: "hitl_pipeline",
  entry_point: "draft",
  nodes: [
    { id: "draft", type: "llm" },
    { id: "review", type: "interrupt" },
    { id: "publish", type: "local_script" },
  ],
  edges: [
    { from: "draft", to: "review", type: "standard" },
    { from: "review", to: "publish", type: "standard" },
  ],
});

const result = await runWorkflow(workflow, {}, { handlers });
if (result.status === "suspended") {
  const sessionId = crypto.randomUUID();
  await sessions.set(sessionId, result.snapshot);
  const snapshot = await sessions.get(sessionId);
  const resumed = await resumeWorkflow(snapshot!, {
    handlers,
    state: { approved: true },
  });
  await sessions.delete(sessionId);
  // use resumed.state …
}
```

`interrupt` requires no handler. Swap `MemorySessionStore` for a real `SessionStore` in production. A fuller demo with APIs: [HN Roast](#hn-roast) below.

---

## TypeScript programs

### [`examples/quick-start.ts`](examples/quick-start.ts)

**What it shows:** A minimal **linear** pipeline in code: `parse` a workflow, `runWorkflow` with handlers keyed by node `type`. No CLI.

**Behavior:** Handlers parse a seed URL (`new URL`), build one summary string (standing in for an LLM), log it, set `published: true`. No network or API keys.

**Run:**

```sh
npx tsx examples/quick-start.ts
```

**Imports:** Uses `../src/index.js` so it runs against the workspace; swap to `orinocoflow` when using the published package.

---

### [`examples/parallel.ts`](examples/parallel.ts)

**What it shows:** **Parallel fork/join** — a `parallel` edge from `fan` with `targets: [branch_a, branch_b]` and `join: "join"`, each branch a straight **standard** chain to `join`, then one node after merge. Emits `parallel_fork` / `parallel_join` in the trace.

**Behavior:** One `task` handler switches on `node.id`. Branch handlers use short `setTimeout` delays so both branches overlap in time. Final state includes merged keys from both branches (`branchA`, `branchB`) plus post-merge steps.

**Run:**

```sh
npx tsx examples/parallel.ts
```

**Constraints:** Matches the engine’s “simple tier” validator (no conditionals inside branches, no extra edges into `join`, etc.). See the main README **Edges → Parallel** section.

---

### [`examples/parallel-error.ts`](examples/parallel-error.ts)

**What it shows:** **Parallel error handling** — three branches; **`branch_b` throws after 500ms** (`delay(500)`); **`branch_a`** (~80ms) and **`branch_c`** (~120ms) finish first. `runWorkflow` **rejects** (no merge at `join`). The trace includes **`parallel_branch_error`**.

**Behavior:** **`async` helpers** (`runParallelDemo`, `main`, `delay`) and **`try`/`catch`** around `runWorkflow` so the process exits cleanly. On failure, the script reads **`node_complete`** events for `fan/branch_a` and `fan/branch_c` and prints **`resultA` / `resultC`** JSON. Siblings are **aborted between nodes** after the failure (fail-fast, best-effort).

**Run:**

```sh
npx tsx examples/parallel-error.ts
```

---

## HN Roast

### [`examples/hn-roast.ts`](examples/hn-roast.ts) + [`examples/hn-roast.yaml`](examples/hn-roast.yaml)

**What it shows:** **Human-in-the-loop** — fetch HN story/comments, call Claude for a “roast”, **suspend** at an `interrupt` node, optional **resume** with merged state. Demonstrates real I/O and `resumeWorkflow`.

**Files:**

| File | Role |
|------|------|
| `hn-roast.ts` | Programmatic workflow + handlers; writes snapshot path (default `/tmp/hn-roast-snap.json`) |
| `hn-roast.yaml` | Same graph as data (for `oflow compile` / `viz` / `simulate`) |
| [`examples/hn-roast.mock.yaml`](examples/hn-roast.mock.yaml) | Mock state for **`oflow simulate`** (no API keys, no network) |

**Run (live — needs `ANTHROPIC_API_KEY`):**

```sh
export ANTHROPIC_API_KEY=sk-ant-...
npx tsx examples/hn-roast.ts
# approve path writes snapshot; then:
npx tsx examples/hn-roast.ts --resume /tmp/hn-roast-snap.json
```

**Run (simulation — no keys):**

```sh
npx tsx src/cli/index.ts simulate examples/hn-roast.yaml examples/hn-roast.mock.yaml
```

---

### [`examples/pr_pipeline.ts`](examples/pr_pipeline.ts)

**What it shows:** A richer graph: **conditional** routing, **retry**-style loop implied by handlers, **`sub_workflow`** with `registry`, stub handlers only (no external APIs).

**Behavior:** Reads an optional numeric **confidence** from `argv` (default affects which branch runs). Prints a full **event trace** to stdout.

**Run:**

```sh
npx tsx examples/pr_pipeline.ts 40
```

Use a number **> 80** to skip the simulated human-review path (see script comments).

---

## YAML / JSON workflows and CLI

### [`examples/odt-pipeline.yaml`](examples/odt-pipeline.yaml) / [`examples/odt-pipeline.json`](examples/odt-pipeline.json)

**What it shows:** A **branching** pipeline with **conditionals** and **retry escalation** (`maxRetries` / `onExhausted`) suitable for `oflow compile`, `viz`, and `simulate`. YAML and JSON are equivalent fixtures used in tests.

**Run:**

```sh
npx tsx src/cli/index.ts compile examples/odt-pipeline.yaml
npx tsx src/cli/index.ts viz examples/odt-pipeline.yaml
npx tsx src/cli/index.ts simulate examples/odt-pipeline.yaml examples/mock.yaml
```

After `npm run build`, you can use `oflow` instead of `npx tsx src/cli/index.ts` if the package is linked or installed.

---

### [`examples/mock.yaml`](examples/mock.yaml)

**What it shows:** **Mock data** for `oflow simulate` — a top-level `handlers` map keyed by **node id** (and `nodeId.N` for repeat visits). Paired with `odt-pipeline.yaml` in the simulate command above.

**Generate your own** from any workflow:

```sh
npx tsx src/cli/index.ts create my-mock.yaml --from examples/odt-pipeline.yaml
```

---

## Node specs (documentation only)

### [`examples/node-specs/`](examples/node-specs/)

**What it shows:** Optional **NodeSpec** YAML files (`fetch`, `llm`, `interrupt`, `output`) matching the HN Roast node types. The runtime does not enforce them; they document inputs/outputs for humans and LLMs.

**Use with code:** `parseNodeSpec` after loading YAML (see main README **Node spec** section).

---

## Quick reference: `oflow` commands (clone + build)

| Command | Purpose |
|---------|---------|
| `oflow create <file>` | Scaffold a workflow (templates: basic / standard / advanced) |
| `oflow create <mock.yaml> --from <workflow.yaml>` | Generate a mock file for simulate |
| `oflow compile <file>` | Parse + validate (including parallel rules) → JSON |
| `oflow viz <file>` | ASCII DAG |
| `oflow simulate <workflow> <mock>` | Dry-run with mock merges |

Use `npx tsx src/cli/index.ts <subcommand> …` before building or when developing from source.
