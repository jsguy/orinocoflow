import { describe, it, expect } from "vitest";
import { renderViz } from "../src/cli/viz.js";
import type { Workflow } from "../src/schemas.js";

const linear: Workflow = {
  version: "1.0",
  graph_id: "linear",
  entry_point: "a",
  nodes: [
    { id: "a", type: "a" },
    { id: "b", type: "b" },
    { id: "c", type: "c" },
  ],
  edges: [
    { from: "a", to: "b", type: "standard" },
    { from: "b", to: "c", type: "standard" },
  ],
};

const withConditional: Workflow = {
  version: "1.0",
  graph_id: "branching",
  entry_point: "start",
  nodes: [
    { id: "start", type: "start" },
    { id: "yes", type: "yes" },
    { id: "no", type: "no" },
  ],
  edges: [
    {
      from: "start",
      type: "conditional",
      condition: { field: "ok", operator: "===", value: true },
      routes: { true: "yes", false: "no" },
    },
  ],
};

const withLoop: Workflow = {
  version: "1.0",
  graph_id: "loop",
  entry_point: "check",
  nodes: [
    { id: "check", type: "check" },
    { id: "fix", type: "fix" },
  ],
  edges: [
    {
      from: "check",
      type: "conditional",
      condition: { field: "done", operator: "===", value: true },
      routes: { true: "fix", false: "fix" },
    },
    { from: "fix", to: "check", type: "standard" },
  ],
};

const withMerge: Workflow = {
  version: "1.0",
  graph_id: "merge",
  entry_point: "start",
  nodes: [
    { id: "start", type: "start" },
    { id: "a", type: "a" },
    { id: "b", type: "b" },
    { id: "end", type: "end" },
  ],
  edges: [
    {
      from: "start",
      type: "conditional",
      condition: { field: "flag", operator: "===", value: true },
      routes: { true: "a", false: "b" },
    },
    { from: "a", to: "end", type: "standard" },
    { from: "b", to: "end", type: "standard" },
  ],
};

const withRetry: Workflow = {
  version: "1.0",
  graph_id: "retry",
  entry_point: "verify",
  nodes: [
    { id: "verify", type: "verify" },
    { id: "fix", type: "fix" },
    { id: "done", type: "done" },
    { id: "handoff", type: "handoff" },
  ],
  edges: [
    {
      from: "verify",
      type: "conditional",
      condition: { field: "passed", operator: "===", value: true },
      routes: { true: "done", false: "fix" },
      maxRetries: 2,
      onExhausted: "handoff",
    },
    { from: "fix", to: "verify", type: "standard" },
  ],
};

describe("renderViz", () => {
  it("renders a linear workflow", () => {
    const output = renderViz(linear);
    expect(output).toContain("a");
    expect(output).toContain("└──> b");
    expect(output).toContain("└──> c");
    // no branching characters
    expect(output).not.toContain("├──");
  });

  it("renders conditional branch annotations", () => {
    const output = renderViz(withConditional);
    expect(output).toContain("[ok === true]");
    expect(output).toContain("[ok === false]");
    expect(output).toContain("yes");
    expect(output).toContain("no");
  });

  it("marks back-edges as (loop)", () => {
    const output = renderViz(withLoop);
    expect(output).toContain("(loop)");
    // check (loop) doesn't recurse
    const lines = output.split("\n");
    const loopLine = lines.find((l) => l.includes("(loop)"))!;
    expect(loopLine).toContain("check");
  });

  it("marks merge points as (visited)", () => {
    const output = renderViz(withMerge);
    expect(output).toContain("(visited)");
    // 'end' appears once without (visited) and once with it
    const lines = output.split("\n").filter((l) => l.includes("end"));
    expect(lines.length).toBe(2);
    expect(lines.some((l) => l.includes("(visited)"))).toBe(true);
    expect(lines.some((l) => !l.includes("(visited)"))).toBe(true);
  });

  it("annotates retry and exhausted on the false branch", () => {
    const output = renderViz(withRetry);
    expect(output).toContain("(retry: 2, exhausted: handoff)");
    expect(output).toContain("[passed === false]");
  });

  it("renders odt-pipeline matching expected structure", async () => {
    const { compileFile } = await import("../src/cli/compile.js");
    const workflow = await compileFile("examples/odt-pipeline.yaml");
    const output = renderViz(workflow);
    expect(output).toContain("provision");
    expect(output).toContain("[harness_success === true]");
    expect(output).toContain("[harness_success === false]");
    expect(output).toContain("(retry: 3, exhausted: handoff)");
    expect(output).toContain("verify (loop)");
    expect(output).toContain("notify (visited)");
  });
});
