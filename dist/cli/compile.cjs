"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/cli/compile.ts
var compile_exports = {};
__export(compile_exports, {
  compileFile: () => compileFile,
  transformYamlToWorkflow: () => transformYamlToWorkflow
});
module.exports = __toCommonJS(compile_exports);
var import_promises = require("fs/promises");
var import_yaml = require("yaml");

// src/schemas.ts
var import_zod = require("zod");
var WorkflowNodeSchema = import_zod.z.object({
  id: import_zod.z.string(),
  type: import_zod.z.string()
}).passthrough();
var StandardEdgeSchema = import_zod.z.object({
  from: import_zod.z.string(),
  to: import_zod.z.string(),
  type: import_zod.z.literal("standard")
});
var ConditionalEdgeSchema = import_zod.z.object({
  from: import_zod.z.string(),
  type: import_zod.z.literal("conditional"),
  condition: import_zod.z.object({
    field: import_zod.z.string(),
    operator: import_zod.z.string(),
    value: import_zod.z.unknown()
  }),
  routes: import_zod.z.object({
    true: import_zod.z.string(),
    false: import_zod.z.string()
  }),
  maxRetries: import_zod.z.number().int().nonnegative().optional(),
  onExhausted: import_zod.z.string().optional()
});
var EdgeSchema = import_zod.z.discriminatedUnion("type", [
  StandardEdgeSchema,
  ConditionalEdgeSchema
]);
var WorkflowSchema = import_zod.z.object({
  version: import_zod.z.literal("1.0"),
  graph_id: import_zod.z.string(),
  entry_point: import_zod.z.string(),
  nodes: import_zod.z.array(WorkflowNodeSchema),
  edges: import_zod.z.array(EdgeSchema)
});
function parse(raw) {
  return WorkflowSchema.parse(raw);
}

// src/cli/compile.ts
async function compileFile(path) {
  const content = await (0, import_promises.readFile)(path, "utf8");
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "yaml" || ext === "yml") {
    return parse((0, import_yaml.parse)(content));
  } else if (ext === "json") {
    return parse(JSON.parse(content));
  } else {
    throw new Error(`Unsupported file extension ".${ext}": expected .yaml, .yml, or .json`);
  }
}
function transformYamlToWorkflow(doc) {
  return parse(doc);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  compileFile,
  transformYamlToWorkflow
});
