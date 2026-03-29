import { describe, it, expect } from "vitest";
import { writeFile, readFile } from "node:fs/promises";
import { runCreate } from "../src/cli/create.js";
import { compileFile } from "../src/cli/compile.js";
import { parse as yamlParse } from "yaml";

async function create(args: string[]) {
  await runCreate(args);
}

describe("oflow create — workflow templates", () => {
  it("creates a basic YAML template that compiles", async () => {
    const path = "/tmp/create-test-basic.yaml";
    await create([path, "--template", "basic"]);
    const workflow = await compileFile(path);
    expect(workflow.orinocoflow_version).toBe("1.0");
    expect(workflow.nodes.length).toBeGreaterThan(0);
    expect(workflow.edges.every((e) => e.type === "standard")).toBe(true);
  });

  it("creates a standard YAML template with conditional edge", async () => {
    const path = "/tmp/create-test-standard.yaml";
    await create([path, "--template", "standard"]);
    const workflow = await compileFile(path);
    const conditionals = workflow.edges.filter((e) => e.type === "conditional");
    expect(conditionals.length).toBeGreaterThan(0);
    const edge = conditionals[0];
    expect(edge.type).toBe("conditional");
    expect(edge.maxRetries).toBeDefined();
    expect(edge.onExhausted).toBeDefined();
  });

  it("creates an advanced template as two files", async () => {
    const path = "/tmp/create-test-advanced.yaml";
    const subPath = "/tmp/create-test-advanced-review.yaml";
    await create([path, "--template", "advanced"]);
    // Both files must compile
    const main = await compileFile(path);
    const sub = await compileFile(subPath);
    // Main has a sub_workflow node referencing the sub
    const subNode = main.nodes.find((n) => n.type === "sub_workflow");
    expect(subNode).toBeDefined();
    expect((subNode as any).workflow_id).toBe(sub.graph_id);
  });

  it("creates a JSON template (no comments, valid JSON)", async () => {
    const path = "/tmp/create-test-basic.json";
    await create([path, "--template", "basic"]);
    const raw = await readFile(path, "utf8");
    // Must be valid JSON
    const parsed = JSON.parse(raw);
    expect(parsed.orinocoflow_version).toBe("1.0");
    // Must not contain comment characters
    expect(raw).not.toContain("# ");
  });

  it("creates a standalone mock template", async () => {
    const path = "/tmp/create-test-mock.yaml";
    await create([path, "--template", "mock"]);
    const content = await readFile(path, "utf8");
    expect(content).toContain("handlers:");
    expect(content).toContain(".2");
  });

  it("throws on unknown template name", async () => {
    await expect(
      create(["/tmp/noop.yaml", "--template", "nonexistent"]),
    ).rejects.toThrow(/Unknown template/);
  });
});

describe("oflow create --from (mock generation)", () => {
  it("generates stubs for every handler node", async () => {
    const path = "/tmp/create-from-basic.yaml";
    await create([path, "--from", "examples/odt-pipeline.yaml"]);
    const content = await readFile(path, "utf8");
    const parsed = yamlParse(content) as { handlers: Record<string, unknown> };
    // All 8 nodes should appear (interrupt/sub_workflow are filtered — none here)
    expect(Object.keys(parsed.handlers)).toContain("provision");
    expect(Object.keys(parsed.handlers)).toContain("harness");
    expect(Object.keys(parsed.handlers)).toContain("verify");
    expect(Object.keys(parsed.handlers)).toContain("teardown");
  });

  it("pre-fills retry node with field name and fail/succeed values", async () => {
    const path = "/tmp/create-from-retry.yaml";
    await create([path, "--from", "examples/odt-pipeline.yaml"]);
    const content = await readFile(path, "utf8");
    // verify is a retry source — should have .2 variant with correct field
    expect(content).toContain("verify:");
    expect(content).toContain("verify_passed: false");
    expect(content).toContain("verify.2:");
    expect(content).toContain("verify_passed: true");
  });

  it("generates valid JSON mock from --from", async () => {
    const path = "/tmp/create-from.json";
    await create([path, "--from", "examples/odt-pipeline.yaml"]);
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw);
    expect(parsed.handlers).toBeDefined();
    expect(Object.keys(parsed.handlers).length).toBeGreaterThan(0);
  });

  it("filters out interrupt and sub_workflow nodes", async () => {
    // Create a workflow with interrupt + sub_workflow nodes to test filtering
    const wf = {
      orinocoflow_version: "1.0",
      graph_id: "filter-test",
      entry_point: "a",
      nodes: [
        { id: "a", type: "a" },
        { id: "pause", type: "interrupt" },
        { id: "sub", type: "sub_workflow", workflow_id: "other" },
        { id: "b", type: "b" },
      ],
      edges: [
        { from: "a", to: "pause", type: "standard" },
        { from: "pause", to: "sub", type: "standard" },
        { from: "sub", to: "b", type: "standard" },
      ],
    };
    const wfPath = "/tmp/filter-test.json";
    await writeFile(wfPath, JSON.stringify(wf));
    const mockPath = "/tmp/filter-test-mock.yaml";
    await create([mockPath, "--from", wfPath]);
    const content = await readFile(mockPath, "utf8");
    // a and b should be there, interrupt and sub_workflow should not
    expect(content).toContain("  a:");
    expect(content).toContain("  b:");
    expect(content).not.toContain("  pause:");
    expect(content).not.toContain("  sub:");
  });
});
