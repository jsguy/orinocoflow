import { describe, it, expect } from "vitest";
import { writeFile, readFile } from "node:fs/promises";
import { compileFile, transformYamlToWorkflow } from "../src/cli/compile.js";
import { ZodError } from "zod";

const YAML_PATH = "examples/odt-pipeline.yaml";
const JSON_PATH = "examples/odt-pipeline.json";

describe("compileFile", () => {
  it("parses a valid YAML workflow", async () => {
    const workflow = await compileFile(YAML_PATH);
    expect(workflow.graph_id).toBe("odt-pipeline");
    expect(workflow.orinocoflow_version).toBe("1.0");
    expect(workflow.entry_point).toBe("provision");
    expect(workflow.nodes).toHaveLength(8);
    expect(workflow.edges).toHaveLength(7);
  });

  it("parses a valid JSON workflow", async () => {
    const workflow = await compileFile(JSON_PATH);
    expect(workflow.graph_id).toBe("odt-pipeline");
    expect(workflow.entry_point).toBe("provision");
  });

  it("YAML and JSON produce identical output", async () => {
    const fromYaml = await compileFile(YAML_PATH);
    const fromJson = await compileFile(JSON_PATH);
    expect(fromYaml).toEqual(fromJson);
  });

  it("throws ZodError for invalid schema", async () => {
    await writeFile("/tmp/bad-schema.yaml", 'orinocoflow_version: "1.0"\ngraph_id: test\n');
    await expect(compileFile("/tmp/bad-schema.yaml")).rejects.toBeInstanceOf(ZodError);
  });

  it("parses a workflow without orinocoflow_version", async () => {
    await writeFile(
      "/tmp/no-version.yaml",
      "graph_id: no-version\nentry_point: a\nnodes:\n  - id: a\n    type: a\nedges: []\n",
    );
    const workflow = await compileFile("/tmp/no-version.yaml");
    expect(workflow.graph_id).toBe("no-version");
    expect(workflow.orinocoflow_version).toBeUndefined();
  });

  it("throws on malformed YAML syntax", async () => {
    await writeFile("/tmp/bad-syntax.yaml", "version: [\nbroken");
    await expect(compileFile("/tmp/bad-syntax.yaml")).rejects.toThrow();
  });

  it("throws on unsupported file extension", async () => {
    await writeFile("/tmp/workflow.toml", "");
    await expect(compileFile("/tmp/workflow.toml")).rejects.toThrow(/Unsupported file extension/);
  });
});

describe("transformYamlToWorkflow", () => {
  it("validates a valid workflow object", async () => {
    const raw = JSON.parse(await readFile(JSON_PATH, "utf8"));
    const workflow = transformYamlToWorkflow(raw);
    expect(workflow.graph_id).toBe("odt-pipeline");
  });

  it("throws ZodError for invalid document", () => {
    expect(() => transformYamlToWorkflow({ not: "a workflow" })).toThrow(ZodError);
  });
});
