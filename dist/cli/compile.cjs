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
var ParallelEdgeSchema = import_zod.z.object({
  from: import_zod.z.string(),
  type: import_zod.z.literal("parallel"),
  targets: import_zod.z.array(import_zod.z.string()).min(2),
  join: import_zod.z.string()
});
var EdgeSchema = import_zod.z.discriminatedUnion("type", [
  StandardEdgeSchema,
  ConditionalEdgeSchema,
  ParallelEdgeSchema
]);
var WorkflowSchema = import_zod.z.object({
  orinocoflow_version: import_zod.z.string().optional(),
  graph_id: import_zod.z.string(),
  entry_point: import_zod.z.string(),
  nodes: import_zod.z.array(WorkflowNodeSchema),
  edges: import_zod.z.array(EdgeSchema)
});
function parse(raw) {
  return WorkflowSchema.parse(raw);
}
var NodeSpecFieldSchema = import_zod.z.object({
  type: import_zod.z.string().optional(),
  required: import_zod.z.boolean().optional(),
  description: import_zod.z.string().optional()
});
var NodeSpecIOSchema = import_zod.z.object({
  name: import_zod.z.string(),
  type: import_zod.z.string().optional(),
  description: import_zod.z.string().optional()
});
var NodeSpecInputSchema = NodeSpecIOSchema.extend({
  required: import_zod.z.boolean().optional()
});
var NodeSpecSchema = import_zod.z.object({
  node_type: import_zod.z.string(),
  description: import_zod.z.string().optional(),
  config: import_zod.z.record(NodeSpecFieldSchema).optional(),
  inputs: import_zod.z.array(NodeSpecInputSchema).optional(),
  outputs: import_zod.z.array(NodeSpecIOSchema).optional()
});

// src/errors.ts
var WorkflowConfigurationError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "WorkflowConfigurationError";
  }
};

// src/validate.ts
function nodeById(workflow, id) {
  return workflow.nodes.find((n) => n.id === id);
}
function collectParallelBranchNodes(workflow, target, join) {
  if (target === join) {
    throw new WorkflowConfigurationError(
      `Parallel branch target cannot be the join node "${join}" (zero-hop branches are not allowed).`
    );
  }
  const visited = [];
  let cur = target;
  for (; ; ) {
    visited.push(cur);
    const outgoing = workflow.edges.filter((e2) => e2.from === cur);
    if (outgoing.length !== 1) {
      throw new WorkflowConfigurationError(
        `Parallel branch from "${target}" invalid at "${cur}": expected exactly one outgoing edge toward join "${join}".`
      );
    }
    const e = outgoing[0];
    if (e.type === "parallel") {
      throw new WorkflowConfigurationError(
        `Nested parallel from "${cur}" is not allowed inside a parallel branch (simple tier).`
      );
    }
    if (e.type === "conditional") {
      throw new WorkflowConfigurationError(
        `Conditional edge from "${cur}" is not allowed inside a parallel branch (simple tier).`
      );
    }
    if (e.type !== "standard") {
      throw new WorkflowConfigurationError(`Parallel branch from "${target}" has non-standard edge from "${cur}".`);
    }
    if (e.to === join) {
      return visited;
    }
    if (visited.includes(e.to)) {
      throw new WorkflowConfigurationError(`Parallel branch from "${target}" contains a cycle at "${e.to}".`);
    }
    cur = e.to;
  }
}
function assertNoInterruptOrSubworkflow(workflow, nodeIds, context) {
  for (const id of nodeIds) {
    const n = nodeById(workflow, id);
    if (!n) continue;
    if (n.type === "interrupt") {
      throw new WorkflowConfigurationError(
        `Node "${id}" (${context}) cannot be an interrupt inside a parallel branch (v1).`
      );
    }
    if (n.type === "sub_workflow") {
      throw new WorkflowConfigurationError(
        `Node "${id}" (${context}) cannot be a sub_workflow inside a parallel branch (v1).`
      );
    }
  }
}
function validateParallelWorkflow(workflow) {
  const nodeIds = new Set(workflow.nodes.map((n) => n.id));
  const byFrom = /* @__PURE__ */ new Map();
  for (const e of workflow.edges) {
    if (!byFrom.has(e.from)) byFrom.set(e.from, []);
    byFrom.get(e.from).push(e);
  }
  for (const [from, list] of byFrom) {
    if (list.length > 1) {
      throw new WorkflowConfigurationError(
        `Node "${from}" has ${list.length} outgoing edges; exactly one is required.`
      );
    }
  }
  const parallelEdges = workflow.edges.filter((e) => e.type === "parallel");
  const joinUsedBy = /* @__PURE__ */ new Map();
  for (const pe of parallelEdges) {
    if (joinUsedBy.has(pe.join)) {
      throw new WorkflowConfigurationError(
        `Join node "${pe.join}" is referenced by more than one parallel edge; each join must be unique.`
      );
    }
    joinUsedBy.set(pe.join, pe);
    if (!nodeIds.has(pe.from)) {
      throw new WorkflowConfigurationError(`Parallel edge from unknown node "${pe.from}".`);
    }
    if (!nodeIds.has(pe.join)) {
      throw new WorkflowConfigurationError(`Parallel edge references unknown join node "${pe.join}".`);
    }
    const tset = new Set(pe.targets);
    if (tset.size !== pe.targets.length) {
      throw new WorkflowConfigurationError(`Parallel edge from "${pe.from}" has duplicate targets.`);
    }
    for (const t of pe.targets) {
      if (!nodeIds.has(t)) {
        throw new WorkflowConfigurationError(`Parallel edge from "${pe.from}" references unknown target "${t}".`);
      }
      if (t === pe.join) {
        throw new WorkflowConfigurationError(`Parallel target cannot equal join "${pe.join}".`);
      }
    }
    const branchChains = [];
    const allBranchNodes = /* @__PURE__ */ new Set();
    for (const target of pe.targets) {
      const chain = collectParallelBranchNodes(workflow, target, pe.join);
      assertNoInterruptOrSubworkflow(workflow, chain, `parallel branch from "${target}"`);
      for (const id of chain) {
        if (allBranchNodes.has(id)) {
          throw new WorkflowConfigurationError(
            `Parallel branches from "${pe.from}" overlap at node "${id}"; branches must be disjoint (simple tier).`
          );
        }
        allBranchNodes.add(id);
      }
      branchChains.push(chain);
    }
    const preds = /* @__PURE__ */ new Set();
    for (const chain of branchChains) {
      const last = chain[chain.length - 1];
      preds.add(last);
    }
    const intoJoin = workflow.edges.filter(
      (e) => e.type === "standard" && e.to === pe.join
    );
    const fromIncoming = new Set(intoJoin.map((e) => e.from));
    if (intoJoin.length !== preds.size || ![...preds].every((p) => fromIncoming.has(p))) {
      throw new WorkflowConfigurationError(
        `Join "${pe.join}" may only be entered via standard edges from parallel branch tips [${[...preds].sort().join(", ")}]; found edges from [${[...fromIncoming].sort().join(", ")}]. No shortcuts or extra ingress.`
      );
    }
  }
}

// src/cli/compile.ts
async function compileFile(path) {
  const content = await (0, import_promises.readFile)(path, "utf8");
  const ext = path.split(".").pop()?.toLowerCase();
  let workflow;
  if (ext === "yaml" || ext === "yml") {
    workflow = parse((0, import_yaml.parse)(content));
  } else if (ext === "json") {
    workflow = parse(JSON.parse(content));
  } else {
    throw new Error(`Unsupported file extension ".${ext}": expected .yaml, .yml, or .json`);
  }
  validateParallelWorkflow(workflow);
  return workflow;
}
function transformYamlToWorkflow(doc) {
  const workflow = parse(doc);
  validateParallelWorkflow(workflow);
  return workflow;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  compileFile,
  transformYamlToWorkflow
});
