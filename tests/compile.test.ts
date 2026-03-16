import { describe, it, expect } from "bun:test";
import { compileFile, transformYamlToWorkflow } from "../src/cli/compile.js";
import { ZodError } from "zod";

const YAML_PATH = "examples/odt-pipeline.yaml";
const JSON_PATH = "examples/odt-pipeline.json";

describe("compileFile", () => {
  it("parses a valid YAML workflow", async () => {
    const workflow = await compileFile(YAML_PATH);
    expect(workflow.graph_id).toBe("odt-pipeline");
    expect(workflow.version).toBe("1.0");
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
    await Bun.write("/tmp/bad-schema.yaml", 'version: "1.0"\ngraph_id: test\n');
    await expect(compileFile("/tmp/bad-schema.yaml")).rejects.toBeInstanceOf(ZodError);
  });

  it("throws on malformed YAML syntax", async () => {
    await Bun.write("/tmp/bad-syntax.yaml", "version: [\nbroken");
    await expect(compileFile("/tmp/bad-syntax.yaml")).rejects.toThrow();
  });

  it("throws on unsupported file extension", async () => {
    await Bun.write("/tmp/workflow.toml", "");
    await expect(compileFile("/tmp/workflow.toml")).rejects.toThrow(/Unsupported file extension/);
  });
});

describe("transformYamlToWorkflow", () => {
  it("validates a valid workflow object", async () => {
    const raw = await Bun.file(JSON_PATH).json();
    const workflow = transformYamlToWorkflow(raw);
    expect(workflow.graph_id).toBe("odt-pipeline");
  });

  it("throws ZodError for invalid document", () => {
    expect(() => transformYamlToWorkflow({ not: "a workflow" })).toThrow(ZodError);
  });
});
