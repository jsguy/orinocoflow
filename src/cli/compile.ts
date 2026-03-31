import { readFile } from "node:fs/promises";
import { parse as yamlParse } from "yaml";
import { parse } from "../schemas.js";
import type { Workflow } from "../schemas.js";
import { validateParallelWorkflow } from "../validate.js";

/**
 * Load a workflow from a `.yaml`, `.yml`, or `.json` file path, validate, and return a typed {@link Workflow}.
 *
 * @param path - Filesystem path to the workflow file.
 * @returns Parsed workflow ready for `runWorkflow` from `"orinocoflow"`.
 * @example
 * ```ts
 * import { compileFile } from "orinocoflow/compile";
 * import { runWorkflow } from "orinocoflow";
 *
 * const workflow = await compileFile("./pipeline.yaml");
 * await runWorkflow(workflow, {}, { handlers: { noop: async (_n, s) => s } } });
 * ```
 */
export async function compileFile(path: string): Promise<Workflow> {
  const content = await readFile(path, "utf8");
  const ext = path.split(".").pop()?.toLowerCase();

  let workflow: Workflow;
  if (ext === "yaml" || ext === "yml") {
    workflow = parse(yamlParse(content));
  } else if (ext === "json") {
    workflow = parse(JSON.parse(content));
  } else {
    throw new Error(`Unsupported file extension ".${ext}": expected .yaml, .yml, or .json`);
  }
  validateParallelWorkflow(workflow);
  return workflow;
}

/**
 * Parse an in-memory YAML/JSON document (already parsed to a plain object) into a {@link Workflow}.
 * Same validation as {@link compileFile} without reading from disk.
 *
 * @param doc - Unknown value (typically `unknown` from a YAML parser).
 * @returns Parsed workflow.
 * @example
 * ```ts
 * import { transformYamlToWorkflow } from "orinocoflow/compile";
 * import { runWorkflow } from "orinocoflow";
 *
 * const workflow = transformYamlToWorkflow({
 *   graph_id: "g",
 *   entry_point: "a",
 *   nodes: [{ id: "a", type: "noop" }],
 *   edges: [],
 * });
 * await runWorkflow(workflow, {}, { handlers: { noop: async (_n, s) => s } } });
 * ```
 */
export function transformYamlToWorkflow(doc: unknown): Workflow {
  const workflow = parse(doc);
  validateParallelWorkflow(workflow);
  return workflow;
}
