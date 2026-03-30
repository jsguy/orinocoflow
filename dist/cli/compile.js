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
var ParallelEdgeSchema = z.object({
  from: z.string(),
  type: z.literal("parallel"),
  targets: z.array(z.string()).min(2),
  join: z.string()
});
var EdgeSchema = z.discriminatedUnion("type", [
  StandardEdgeSchema,
  ConditionalEdgeSchema,
  ParallelEdgeSchema
]);
var WorkflowSchema = z.object({
  orinocoflow_version: z.string().optional(),
  graph_id: z.string(),
  entry_point: z.string(),
  nodes: z.array(WorkflowNodeSchema),
  edges: z.array(EdgeSchema)
});
function parse(raw) {
  return WorkflowSchema.parse(raw);
}
var NodeSpecFieldSchema = z.object({
  type: z.string().optional(),
  required: z.boolean().optional(),
  description: z.string().optional()
});
var NodeSpecIOSchema = z.object({
  name: z.string(),
  type: z.string().optional(),
  description: z.string().optional()
});
var NodeSpecInputSchema = NodeSpecIOSchema.extend({
  required: z.boolean().optional()
});
var NodeSpecSchema = z.object({
  node_type: z.string(),
  description: z.string().optional(),
  config: z.record(NodeSpecFieldSchema).optional(),
  inputs: z.array(NodeSpecInputSchema).optional(),
  outputs: z.array(NodeSpecIOSchema).optional()
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
  const content = await readFile(path, "utf8");
  const ext = path.split(".").pop()?.toLowerCase();
  let workflow;
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
function transformYamlToWorkflow(doc) {
  const workflow = parse(doc);
  validateParallelWorkflow(workflow);
  return workflow;
}
export {
  compileFile,
  transformYamlToWorkflow
};
