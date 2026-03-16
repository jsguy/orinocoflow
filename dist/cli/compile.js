// src/cli/compile.ts
import { readFile } from "fs/promises";
import { parse as yamlParse } from "yaml";

// src/schemas.ts
import { z } from "zod";
var WorkflowNodeSchema = z.object({
  id: z.string(),
  type: z.string()
}).passthrough();
var StandardEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  type: z.literal("standard")
});
var ConditionalEdgeSchema = z.object({
  from: z.string(),
  type: z.literal("conditional"),
  condition: z.object({
    field: z.string(),
    operator: z.string(),
    value: z.unknown()
  }),
  routes: z.object({
    true: z.string(),
    false: z.string()
  }),
  maxRetries: z.number().int().nonnegative().optional(),
  onExhausted: z.string().optional()
});
var EdgeSchema = z.discriminatedUnion("type", [
  StandardEdgeSchema,
  ConditionalEdgeSchema
]);
var WorkflowSchema = z.object({
  version: z.literal("1.0"),
  graph_id: z.string(),
  entry_point: z.string(),
  nodes: z.array(WorkflowNodeSchema),
  edges: z.array(EdgeSchema)
});
function parse(raw) {
  return WorkflowSchema.parse(raw);
}

// src/cli/compile.ts
async function compileFile(path) {
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
function transformYamlToWorkflow(doc) {
  return parse(doc);
}
export {
  compileFile,
  transformYamlToWorkflow
};
