# Agent instructions — orinocoflow

This repository is the **orinocoflow** npm package: a small TypeScript workflow engine (JSON/YAML graphs + async handlers + streaming events).

## Authoritative context

- **[llms.txt](llms.txt)** — Single-file summary for LLM/agent context (API surface, patterns, doc pointers).
- **[README.md](README.md)** — Human-oriented overview, Quick Start, streaming, errors.
- **[README-examples.md](README-examples.md)** — Runnable examples and CLI usage (`oflow`).

## Rules of thumb

1. Validate workflows with **`parse()`** or **`compileFile()`** from **`orinocoflow/compile`** before **`runWorkflow()`** / **`runWorkflowStream()`**.
2. **`handlers`** keys must match **`node.type`**, not **`node.id`**.
3. Optional **`orinocoflow_version`** on each workflow document; a generic **`version`** key is ignored.
4. For YAML/JSON files, prefer **`compileFile`** or **`transformYamlToWorkflow`** so parallel structure is validated.
5. When extending the engine, keep **`examples/`** and tests aligned with documented behavior.
