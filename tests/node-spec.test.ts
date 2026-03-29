import { describe, it, expect } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { parse as yamlParse } from "yaml";
import { ZodError } from "zod";
import { parseNodeSpec } from "../src/index.js";

describe("parseNodeSpec", () => {
  it("accepts a minimal spec with node_type only", () => {
    const result = parseNodeSpec({ node_type: "my-node" });
    expect(result.node_type).toBe("my-node");
    expect(result.description).toBeUndefined();
    expect(result.config).toBeUndefined();
    expect(result.inputs).toBeUndefined();
    expect(result.outputs).toBeUndefined();
  });

  it("accepts a full spec with config, inputs, and outputs", () => {
    const result = parseNodeSpec({
      node_type: "fetch",
      description: "Fetches data from a URL",
      config: {
        url: { type: "string", required: true, description: "The URL to fetch" },
      },
      inputs: [
        { name: "auth_token", type: "string", required: false, description: "Optional auth token" },
      ],
      outputs: [
        { name: "body", type: "string", description: "Response body" },
        { name: "status", type: "number" },
      ],
    });
    expect(result.node_type).toBe("fetch");
    expect(result.config?.url.required).toBe(true);
    expect(result.inputs).toHaveLength(1);
    expect(result.outputs).toHaveLength(2);
    expect(result.outputs?.[1].name).toBe("status");
  });

  it("throws ZodError when node_type is missing", () => {
    expect(() => parseNodeSpec({ description: "no type here" })).toThrow(ZodError);
  });

  it("throws ZodError for completely invalid input", () => {
    expect(() => parseNodeSpec(null)).toThrow(ZodError);
    expect(() => parseNodeSpec("string")).toThrow(ZodError);
    expect(() => parseNodeSpec(42)).toThrow(ZodError);
  });
});

describe("example node-spec files", () => {
  const specDir = "examples/node-specs";

  it("all YAML files in examples/node-specs/ parse without error", async () => {
    const entries = await readdir(specDir);
    const files = entries
      .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
      .map((f) => `${specDir}/${f}`);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const content = await readFile(file, "utf8");
      const raw = yamlParse(content);
      expect(() => parseNodeSpec(raw)).not.toThrow();
    }
  });
});
