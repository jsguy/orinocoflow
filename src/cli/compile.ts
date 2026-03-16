import { readFile } from "node:fs/promises";
import { parse as yamlParse } from "yaml";
import { parse } from "../schemas.js";
import type { Workflow } from "../schemas.js";

export async function compileFile(path: string): Promise<Workflow> {
  const content = await readFile(path, "utf8");
  const ext = path.split(".").pop()?.toLowerCase();

  if (ext === "yaml" || ext === "yml") {
    return parse(yamlParse(content));
  } else if (ext === "json") {
    return parse(JSON.parse(content));
  } else {
    throw new Error(`Unsupported file extension ".${ext}": expected .yaml, .yml, or .json`);
  }
}

export function transformYamlToWorkflow(doc: unknown): Workflow {
  return parse(doc);
}
