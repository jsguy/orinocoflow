import type { Workflow } from "../schemas.js";
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
export declare function compileFile(path: string): Promise<Workflow>;
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
export declare function transformYamlToWorkflow(doc: unknown): Workflow;
