#!/usr/bin/env node

// src/cli/index.ts
import { writeFile as writeFile2 } from "fs/promises";

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
var NodeNotFoundError = class extends Error {
  constructor(nodeId) {
    super(`Node not found: "${nodeId}"`);
    this.nodeId = nodeId;
    this.name = "NodeNotFoundError";
  }
};
var HandlerError = class extends Error {
  constructor(nodeId, cause) {
    super(
      `Handler failed for node "${nodeId}": ${cause instanceof Error ? cause.message : String(cause)}`
    );
    this.nodeId = nodeId;
    this.name = "HandlerError";
    this.cause = cause;
  }
};
var WorkflowCycleError = class extends Error {
  constructor(maxSteps) {
    super(`Workflow exceeded maxSteps limit of ${maxSteps}. Possible cycle detected.`);
    this.maxSteps = maxSteps;
    this.name = "WorkflowCycleError";
  }
};
var WorkflowAbortedError = class extends Error {
  constructor() {
    super("Workflow execution was aborted.");
    this.name = "WorkflowAbortedError";
  }
};
var InvalidEdgeError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "InvalidEdgeError";
  }
};
var SubWorkflowNotFoundError = class extends Error {
  constructor(workflowId) {
    super(`Sub-workflow not found in registry: "${workflowId}"`);
    this.workflowId = workflowId;
    this.name = "SubWorkflowNotFoundError";
  }
};
var WorkflowConfigurationError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "WorkflowConfigurationError";
  }
};
var ParallelBranchDidNotConvergeError = class extends Error {
  constructor(branchEntry, expectedJoin, actualTerminal) {
    super(
      `Parallel branch from "${branchEntry}" did not converge to join "${expectedJoin}"` + (actualTerminal !== void 0 ? ` (ended at "${actualTerminal}")` : " (no successor to join)")
    );
    this.branchEntry = branchEntry;
    this.expectedJoin = expectedJoin;
    this.actualTerminal = actualTerminal;
    this.name = "ParallelBranchDidNotConvergeError";
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

// src/cli/viz.ts
function buildAdjList(edges) {
  const adj = /* @__PURE__ */ new Map();
  for (const edge of edges) {
    if (!adj.has(edge.from)) adj.set(edge.from, []);
    adj.get(edge.from).push(edge);
  }
  return adj;
}
function formatCondition(edge) {
  const { field, operator, value } = edge.condition;
  return `${field} ${operator} ${JSON.stringify(value)}`;
}
function formatConditionFalse(edge) {
  const { field, operator, value } = edge.condition;
  if (operator === "===" && typeof value === "boolean") return `${field} === ${JSON.stringify(!value)}`;
  if (operator === "!==" && typeof value === "boolean") return `${field} !== ${JSON.stringify(!value)}`;
  const negOp = { "===": "!==", "!==": "===", "<": ">=", ">": "<=", "<=": ">", ">=": "<" };
  return `${field} ${negOp[operator] ?? `!(${operator})`} ${JSON.stringify(value)}`;
}
function dfs(nodeId, adj, ancestors, rendered, prefix, lines) {
  ancestors.add(nodeId);
  rendered.add(nodeId);
  const outgoing = adj.get(nodeId) ?? [];
  for (let i = 0; i < outgoing.length; i++) {
    const edge = outgoing[i];
    const isLast = i === outgoing.length - 1;
    const connector = isLast ? "\u2514\u2500\u2500" : "\u251C\u2500\u2500";
    const continuation = isLast ? "   " : "\u2502  ";
    if (edge.type === "standard") {
      const target = edge.to;
      let label = target;
      if (ancestors.has(target)) {
        label += " (loop)";
        lines.push(`${prefix}${connector}> ${label}`);
      } else if (rendered.has(target)) {
        label += " (visited)";
        lines.push(`${prefix}${connector}> ${label}`);
      } else {
        lines.push(`${prefix}${connector}> ${target}`);
        dfs(target, adj, ancestors, rendered, prefix + continuation + "  ", lines);
      }
    } else if (edge.type === "parallel") {
      const pe = edge;
      for (let b = 0; b < pe.targets.length; b++) {
        const target = pe.targets[b];
        const bIsLast = isLast && b === pe.targets.length - 1;
        const bConnector = bIsLast ? "\u2514\u2500\u2500" : "\u251C\u2500\u2500";
        const bContinuation = bIsLast ? "   " : "\u2502  ";
        const label = `[parallel \u2192 ${pe.join}]`;
        let targetLabel = target;
        if (ancestors.has(target)) {
          targetLabel += " (loop)";
          lines.push(`${prefix}${bConnector}${label}\u2500\u2500> ${targetLabel}`);
        } else if (rendered.has(target)) {
          targetLabel += " (visited)";
          lines.push(`${prefix}${bConnector}${label}\u2500\u2500> ${targetLabel}`);
        } else {
          lines.push(`${prefix}${bConnector}${label}\u2500\u2500> ${target}`);
          dfs(target, adj, ancestors, rendered, prefix + bContinuation + "  ", lines);
        }
      }
    } else {
      const cond = edge;
      const condStr = formatCondition(cond);
      const retryStr = cond.maxRetries !== void 0 ? `  (retry: ${cond.maxRetries}, exhausted: ${cond.onExhausted})` : "";
      const branches = [
        { label: `[${condStr}]`, target: cond.routes.true, extra: "" },
        { label: `[${formatConditionFalse(cond)}]`, target: cond.routes.false, extra: retryStr }
      ];
      for (let b = 0; b < branches.length; b++) {
        const { label, target, extra } = branches[b];
        const bIsLast = isLast && b === branches.length - 1;
        const bConnector = bIsLast ? "\u2514\u2500\u2500" : "\u251C\u2500\u2500";
        const bContinuation = bIsLast ? "   " : "\u2502  ";
        let targetLabel = target + extra;
        if (ancestors.has(target)) {
          targetLabel = target + " (loop)" + extra;
          lines.push(`${prefix}${bConnector}${label}\u2500\u2500> ${targetLabel}`);
        } else if (rendered.has(target)) {
          targetLabel = target + " (visited)" + extra;
          lines.push(`${prefix}${bConnector}${label}\u2500\u2500> ${targetLabel}`);
        } else {
          lines.push(`${prefix}${bConnector}${label}\u2500\u2500> ${target}${extra}`);
          dfs(target, adj, ancestors, rendered, prefix + bContinuation + "  ", lines);
        }
      }
    }
  }
  ancestors.delete(nodeId);
}
function renderViz(workflow) {
  const adj = buildAdjList(workflow.edges);
  const ancestors = /* @__PURE__ */ new Set();
  const rendered = /* @__PURE__ */ new Set();
  const lines = [];
  lines.push(workflow.entry_point);
  dfs(workflow.entry_point, adj, ancestors, rendered, "  ", lines);
  return lines.join("\n");
}

// src/cli/simulate.ts
import { readFile as readFile2 } from "fs/promises";
import { parse as yamlParse2 } from "yaml";

// src/router.ts
function evaluateOperator(fieldValue, operator, conditionValue) {
  switch (operator) {
    case "<":
      return fieldValue < conditionValue;
    case ">":
      return fieldValue > conditionValue;
    case "<=":
      return fieldValue <= conditionValue;
    case ">=":
      return fieldValue >= conditionValue;
    case "===":
      return fieldValue === conditionValue;
    case "!==":
      return fieldValue !== conditionValue;
    case "includes":
      if (typeof fieldValue === "string") {
        return fieldValue.includes(conditionValue);
      }
      if (Array.isArray(fieldValue)) {
        return fieldValue.includes(conditionValue);
      }
      return false;
    case "startsWith":
      return typeof fieldValue === "string" && fieldValue.startsWith(conditionValue);
    case "endsWith":
      return typeof fieldValue === "string" && fieldValue.endsWith(conditionValue);
    default:
      throw new InvalidEdgeError(`Unknown operator: "${operator}"`);
  }
}
function resolveSingleOutgoingEdge(edge, state, workflowNodes) {
  if (edge.type === "standard") {
    return { nextNodeId: edge.to, edgeType: "standard" };
  }
  const conditionResult = evaluateOperator(
    state[edge.condition.field],
    edge.condition.operator,
    edge.condition.value
  );
  const loopbackTarget = conditionResult ? edge.routes.true : edge.routes.false;
  if (edge.maxRetries !== void 0) {
    const retryKey = `${edge.from}:${loopbackTarget}`;
    const retries = state.__retries__ ?? {};
    const count = retries[retryKey] ?? 0;
    if (count >= edge.maxRetries) {
      if (!edge.onExhausted) {
        throw new WorkflowConfigurationError(
          `Edge from "${edge.from}" has maxRetries=${edge.maxRetries} but no onExhausted node defined.`
        );
      }
      if (workflowNodes && !workflowNodes.find((n) => n.id === edge.onExhausted)) {
        throw new WorkflowConfigurationError(
          `Edge from "${edge.from}" references onExhausted node "${edge.onExhausted}" which does not exist in the workflow.`
        );
      }
      return {
        nextNodeId: edge.onExhausted,
        edgeType: "conditional",
        conditionResult,
        retriesExhausted: true,
        onExhausted: edge.onExhausted
      };
    }
    state.__retries__ = { ...retries, [retryKey]: count + 1 };
  }
  return { nextNodeId: loopbackTarget, edgeType: "conditional", conditionResult };
}
function resolveOutgoing(currentNodeId, edges, state, workflowNodes) {
  const outgoing = edges.filter((e) => e.from === currentNodeId);
  if (outgoing.length === 0) return void 0;
  if (outgoing.length > 1) {
    throw new WorkflowConfigurationError(
      `Node "${currentNodeId}" has ${outgoing.length} outgoing edges; exactly one is required.`
    );
  }
  const edge = outgoing[0];
  if (edge.type === "parallel") {
    return { kind: "parallel", edge };
  }
  return { kind: "single", resolution: resolveSingleOutgoingEdge(edge, state, workflowNodes) };
}

// src/execute.ts
function cloneWorkflowStateForParallel(state) {
  try {
    return structuredClone(state);
  } catch {
    throw new WorkflowConfigurationError(
      "Parallel execution requires structuredClone-able workflow state (no functions, symbols, or non-cloneable values)."
    );
  }
}
function mergeParallelBranchStates(states, mode, preForkState) {
  if (states.length === 0) return {};
  if (typeof mode === "function") {
    return mode(states, preForkState);
  }
  if (mode === "overwrite") {
    return Object.assign({}, ...states);
  }
  const out = {};
  for (const s of states) {
    for (const key of Object.keys(s)) {
      if (Object.prototype.hasOwnProperty.call(out, key)) {
        if (!Object.is(out[key], s[key])) {
          throw new WorkflowConfigurationError(
            `Parallel merge conflict on top-level state key "${key}" (strict mode).`
          );
        }
      } else {
        out[key] = s[key];
      }
    }
  }
  return out;
}
async function runBranchUntilJoin(workflow, branchEntry, joinId, branchInitialState, options, emit, forkNodeId, branchNodePrefix, joinNodeIdPrefixed, stepsRef, maxSteps) {
  const { handlers, signal, _parallelSiblingAbort } = options;
  let currentNodeId = branchEntry;
  let currentState = branchInitialState;
  while (currentNodeId !== void 0) {
    if (signal?.aborted) {
      emit({ type: "error", error: new WorkflowAbortedError() });
      throw new WorkflowAbortedError();
    }
    if (_parallelSiblingAbort?.aborted) {
      emit({ type: "error", error: new WorkflowAbortedError() });
      throw new WorkflowAbortedError();
    }
    if (++stepsRef.n > maxSteps) {
      const err = new WorkflowCycleError(maxSteps);
      emit({ type: "error", error: err });
      throw err;
    }
    const node = workflow.nodes.find((n) => n.id === currentNodeId);
    if (!node) {
      const err = new NodeNotFoundError(currentNodeId);
      emit({ type: "error", nodeId: branchNodePrefix(currentNodeId), error: err });
      throw err;
    }
    const prefixedNodeId = branchNodePrefix(node.id);
    if (node.type === "interrupt") {
      throw new WorkflowConfigurationError(
        `Interrupt node "${node.id}" is not allowed inside a parallel branch (v1).`
      );
    }
    emit({
      type: "node_start",
      nodeId: prefixedNodeId,
      nodeType: node.type,
      state: currentState
    });
    const nodeStart = Date.now();
    try {
      if (node.type === "sub_workflow") {
        throw new WorkflowConfigurationError(
          `Sub-workflow node "${node.id}" is not allowed inside a parallel branch (v1).`
        );
      }
      const handler = handlers[node.type] ?? handlers[node.id];
      if (!handler) {
        throw new HandlerError(
          node.id,
          new Error(`No handler registered for node type "${node.type}" or id "${node.id}"`)
        );
      }
      currentState = await handler(node, currentState);
    } catch (err) {
      if (err instanceof WorkflowAbortedError || err instanceof WorkflowCycleError || err instanceof SubWorkflowNotFoundError || err instanceof WorkflowConfigurationError) {
        throw err;
      }
      const wrapped = err instanceof HandlerError ? err : new HandlerError(node.id, err);
      emit({ type: "error", nodeId: prefixedNodeId, error: wrapped });
      throw wrapped;
    }
    emit({
      type: "node_complete",
      nodeId: prefixedNodeId,
      nodeType: node.type,
      state: currentState,
      durationMs: Date.now() - nodeStart
    });
    const outgoing = resolveOutgoing(currentNodeId, workflow.edges, currentState, workflow.nodes);
    if (outgoing === void 0) {
      throw new ParallelBranchDidNotConvergeError(branchEntry, joinId, currentNodeId);
    }
    if (outgoing.kind === "parallel") {
      throw new WorkflowConfigurationError(
        `Nested parallel from "${currentNodeId}" inside branch "${branchEntry}" is invalid.`
      );
    }
    const resolution = outgoing.resolution;
    if (resolution.nextNodeId === joinId) {
      emit({
        type: "edge_taken",
        from: prefixedNodeId,
        to: joinNodeIdPrefixed,
        edgeType: resolution.edgeType,
        conditionResult: resolution.conditionResult,
        ...resolution.retriesExhausted ? { retriesExhausted: true, onExhausted: resolution.onExhausted } : {}
      });
      return currentState;
    }
    emit({
      type: "edge_taken",
      from: prefixedNodeId,
      to: branchNodePrefix(resolution.nextNodeId),
      edgeType: resolution.edgeType,
      conditionResult: resolution.conditionResult,
      ...resolution.retriesExhausted ? { retriesExhausted: true, onExhausted: resolution.onExhausted } : {}
    });
    currentNodeId = resolution.nextNodeId;
  }
  throw new ParallelBranchDidNotConvergeError(branchEntry, joinId, void 0);
}
async function _execute(workflow, initialState, options, emit, entryNodeId, stepsRef) {
  const {
    handlers,
    registry = {},
    maxSteps = 1e3,
    signal,
    _nodeIdPrefix = "",
    parallelMerge = "strict",
    _parallelSiblingAbort
  } = options;
  const prefix = (id) => _nodeIdPrefix ? `${_nodeIdPrefix}/${id}` : id;
  const workflowStart = Date.now();
  const steps = stepsRef ?? { n: 0 };
  emit({
    type: "workflow_start",
    workflowId: workflow.graph_id,
    entryPoint: prefix(entryNodeId ?? workflow.entry_point)
  });
  let currentNodeId = entryNodeId ?? workflow.entry_point;
  let currentState = { ...initialState };
  let enteredViaEdge;
  while (currentNodeId !== void 0) {
    if (signal?.aborted) {
      emit({ type: "error", error: new WorkflowAbortedError() });
      throw new WorkflowAbortedError();
    }
    if (_parallelSiblingAbort?.aborted) {
      emit({ type: "error", error: new WorkflowAbortedError() });
      throw new WorkflowAbortedError();
    }
    if (++steps.n > maxSteps) {
      const err = new WorkflowCycleError(maxSteps);
      emit({ type: "error", error: err });
      throw err;
    }
    const node = workflow.nodes.find((n) => n.id === currentNodeId);
    if (!node) {
      const err = new NodeNotFoundError(currentNodeId);
      emit({ type: "error", nodeId: prefix(currentNodeId), error: err });
      throw err;
    }
    const prefixedNodeId = prefix(node.id);
    if (node.type === "interrupt") {
      const snapshot = {
        workflowId: workflow.graph_id,
        suspendedAtNodeId: node.id,
        state: currentState,
        workflowSnapshot: workflow,
        ...enteredViaEdge !== void 0 ? { enteredViaEdge } : {}
      };
      emit({ type: "workflow_suspended", nodeId: prefixedNodeId });
      return { status: "suspended", snapshot, trace: [] };
    }
    emit({
      type: "node_start",
      nodeId: prefixedNodeId,
      nodeType: node.type,
      state: currentState
    });
    const nodeStart = Date.now();
    try {
      if (node.type === "sub_workflow") {
        const subWorkflowId = node.workflow_id;
        if (!subWorkflowId) {
          throw new Error(`sub_workflow node "${node.id}" is missing workflow_id`);
        }
        const rawSubWorkflow = registry[subWorkflowId];
        if (!rawSubWorkflow) {
          throw new SubWorkflowNotFoundError(subWorkflowId);
        }
        const subWorkflow = parse(rawSubWorkflow);
        validateParallelWorkflow(subWorkflow);
        const subResult = await _execute(
          subWorkflow,
          currentState,
          { ...options, signal, _nodeIdPrefix: prefixedNodeId, _parallelSiblingAbort },
          emit,
          void 0,
          steps
        );
        if (subResult.status === "suspended") {
          return subResult;
        }
        currentState = subResult.state;
      } else {
        const handler = handlers[node.type] ?? handlers[node.id];
        if (!handler) {
          throw new HandlerError(
            node.id,
            new Error(`No handler registered for node type "${node.type}" or id "${node.id}"`)
          );
        }
        currentState = await handler(node, currentState);
      }
    } catch (err) {
      if (err instanceof WorkflowAbortedError || err instanceof WorkflowCycleError || err instanceof SubWorkflowNotFoundError) {
        throw err;
      }
      const wrapped = err instanceof HandlerError ? err : new HandlerError(node.id, err);
      emit({ type: "error", nodeId: prefixedNodeId, error: wrapped });
      throw wrapped;
    }
    emit({
      type: "node_complete",
      nodeId: prefixedNodeId,
      nodeType: node.type,
      state: currentState,
      durationMs: Date.now() - nodeStart
    });
    const outgoing = resolveOutgoing(currentNodeId, workflow.edges, currentState, workflow.nodes);
    if (outgoing?.kind === "parallel") {
      const { edge } = outgoing;
      const joinPrefixed = prefix(edge.join);
      emit({
        type: "parallel_fork",
        from: prefixedNodeId,
        targets: edge.targets,
        join: joinPrefixed
      });
      const parallelFail = new AbortController();
      const onUserAbort = () => parallelFail.abort();
      if (signal) {
        if (signal.aborted) parallelFail.abort();
        else signal.addEventListener("abort", onUserAbort, { once: true });
      }
      const branchOptions = {
        ...options,
        _parallelSiblingAbort: parallelFail.signal
      };
      const branchNodePrefix = (nid) => prefix(`${edge.from}/${nid}`);
      const runOneBranch = async (target) => {
        const cloned = cloneWorkflowStateForParallel(currentState);
        try {
          return await runBranchUntilJoin(
            workflow,
            target,
            edge.join,
            cloned,
            branchOptions,
            emit,
            edge.from,
            branchNodePrefix,
            joinPrefixed,
            steps,
            maxSteps
          );
        } catch (err) {
          emit({
            type: "parallel_branch_error",
            branchEntry: target,
            join: joinPrefixed,
            error: err instanceof Error ? err : new Error(String(err))
          });
          parallelFail.abort();
          throw err;
        }
      };
      let branchStates;
      try {
        branchStates = await Promise.all(edge.targets.map((t) => runOneBranch(t)));
      } finally {
        signal?.removeEventListener("abort", onUserAbort);
      }
      try {
        currentState = mergeParallelBranchStates(branchStates, parallelMerge, currentState);
      } catch (err) {
        emit({
          type: "error",
          nodeId: prefixedNodeId,
          error: err instanceof Error ? err : new Error(String(err))
        });
        throw err;
      }
      emit({
        type: "parallel_join",
        from: prefixedNodeId,
        join: joinPrefixed,
        targets: edge.targets.map((t) => branchNodePrefix(t))
      });
      currentNodeId = edge.join;
      continue;
    }
    if (outgoing?.kind === "single") {
      const resolution = outgoing.resolution;
      enteredViaEdge = {
        from: currentNodeId,
        to: resolution.nextNodeId,
        edgeType: resolution.edgeType,
        ...resolution.conditionResult !== void 0 ? { conditionResult: resolution.conditionResult } : {},
        ...resolution.retriesExhausted ? { retriesExhausted: true, onExhausted: resolution.onExhausted } : {}
      };
      emit({
        type: "edge_taken",
        from: prefixedNodeId,
        to: prefix(resolution.nextNodeId),
        edgeType: resolution.edgeType,
        conditionResult: resolution.conditionResult,
        ...resolution.retriesExhausted ? { retriesExhausted: true, onExhausted: resolution.onExhausted } : {}
      });
      currentNodeId = resolution.nextNodeId;
    } else {
      currentNodeId = void 0;
    }
  }
  emit({
    type: "workflow_complete",
    finalState: currentState,
    durationMs: Date.now() - workflowStart
  });
  return { status: "completed", state: currentState, trace: [] };
}
async function runWorkflow(workflow, initialState, options) {
  validateParallelWorkflow(workflow);
  const trace = [];
  const result = await _execute(workflow, initialState, options, (event) => {
    trace.push(event);
    options.onEvent?.(event);
  });
  return { ...result, trace };
}

// src/cli/simulate.ts
function loadMockData(content, path) {
  const ext = path.split(".").pop()?.toLowerCase();
  return ext === "json" ? JSON.parse(content) : yamlParse2(content);
}
function buildMockHandlers(mockData, workflow) {
  const counts = {};
  function makeHandler(nodeId) {
    return async (_node, state) => {
      counts[nodeId] = (counts[nodeId] ?? 0) + 1;
      const count = counts[nodeId];
      const key = count > 1 ? `${nodeId}.${count}` : nodeId;
      const entry = mockData.handlers[key] ?? mockData.handlers[nodeId] ?? {};
      return { ...state, ...entry };
    };
  }
  const handlers = {};
  for (const node of workflow.nodes) {
    const h = makeHandler(node.id);
    handlers[node.id] = h;
    if (node.type !== node.id) handlers[node.type] = h;
  }
  return handlers;
}
function filterState(state) {
  const { __retries__: _, ...rest } = state;
  return rest;
}
async function runSimulation(workflow, mockFilePath) {
  const content = await readFile2(mockFilePath, "utf8");
  const mockData = loadMockData(content, mockFilePath);
  const handlers = buildMockHandlers(mockData, workflow);
  console.log(`Simulating: ${workflow.graph_id}`);
  console.log(`Mock data: ${mockFilePath}`);
  console.log("");
  let step = 0;
  const nodeCounts = {};
  const path = [];
  const colW = 12;
  function pad(s, w) {
    return s.length >= w ? s : s + " ".repeat(w - s.length);
  }
  const events = [];
  await runWorkflow(workflow, {}, {
    handlers,
    onEvent: (event) => {
      events.push(event);
    }
  });
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (event.type === "node_complete") {
      step++;
      nodeCounts[event.nodeId] = (nodeCounts[event.nodeId] ?? 0) + 1;
      const count = nodeCounts[event.nodeId];
      const label = count > 1 ? `${event.nodeId} (x${count})` : event.nodeId;
      path.push(event.nodeId);
      const stateStr = JSON.stringify(filterState(event.state));
      console.log(`Step ${step} \u2502 ${pad(label, colW)} \u2502 state: ${stateStr}`);
    }
    if (event.type === "parallel_fork") {
      const blank = " ".repeat(`Step ${step}`.length);
      const nodeBlank = pad("", colW);
      console.log(
        `${blank} \u2502 ${nodeBlank} \u2502 parallel fork: ${event.from} \u2192 [${event.targets.join(", ")}] \u2192 join ${event.join}`
      );
    }
    if (event.type === "parallel_join") {
      const blank = " ".repeat(`Step ${step}`.length);
      const nodeBlank = pad("", colW);
      console.log(`${blank} \u2502 ${nodeBlank} \u2502 parallel join \u2192 ${event.join}`);
    }
    if (event.type === "parallel_branch_error") {
      const blank = " ".repeat(`Step ${step}`.length);
      const nodeBlank = pad("", colW);
      console.log(
        `${blank} \u2502 ${nodeBlank} \u2502 parallel branch error (${event.branchEntry}): ${event.error.message}`
      );
    }
    if (event.type === "edge_taken") {
      const blank = " ".repeat(`Step ${step}`.length);
      const nodeBlank = pad("", colW);
      if (event.edgeType === "conditional") {
        const edge = workflow.edges.find(
          (e) => e.type === "conditional" && e.from === event.from.split("/").pop()
        );
        if (edge?.type === "conditional") {
          const { field, operator, value } = edge.condition;
          const result = event.conditionResult;
          if (event.retriesExhausted) {
            console.log(`${blank} \u2502 ${nodeBlank} \u2502 edge: ${field} ${operator} ${JSON.stringify(value)} \u2192 ${result}, retries exhausted \u2192 ${event.to}`);
          } else {
            const nextStep = events.slice(i + 1).find((e) => e.type === "node_complete");
            const retryCount = nodeCounts[event.from.split("/").pop()] ?? 0;
            const maxRetries = edge.maxRetries;
            if (maxRetries !== void 0 && !result) {
              console.log(`${blank} \u2502 ${nodeBlank} \u2502 edge: ${field} ${operator} ${JSON.stringify(value)} \u2192 ${result}, retry ${retryCount}/${maxRetries} \u2192 ${event.to}`);
            } else {
              console.log(`${blank} \u2502 ${nodeBlank} \u2502 edge: ${field} ${operator} ${JSON.stringify(value)} \u2192 ${event.to}`);
            }
          }
        }
      } else {
        const blank2 = " ".repeat(`Step ${step}`.length);
        console.log(`${blank2} \u2502 ${nodeBlank} \u2502 edge: \u2192 ${event.to}`);
      }
    }
  }
  console.log("");
  console.log(`\u2713 Completed in ${step} steps`);
  console.log(`Path: ${path.join(" \u2192 ")}`);
}

// src/cli/create.ts
import * as readline from "readline";
import { writeFile } from "fs/promises";
import { parse as yamlParse3 } from "yaml";
var BASIC_YAML = `# \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
# orinocoflow \u2014 basic workflow template
# \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
#
# A simple linear pipeline: each step runs unconditionally after the previous.
# Use this when your workflow has no branching logic.
#
# \u2500\u2500\u2500 Quick start \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
#
#   oflow viz    <this-file>                   visualise the workflow as ASCII art
#   oflow compile <this-file>                  validate and output compiled JSON
#   oflow simulate <this-file> <mock-file>     dry-run with mock handler data
#
#   Create a mock data file:
#   oflow create mock.yaml --from <this-file>
#
# \u2500\u2500\u2500 TypeScript usage \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
#
#   import { runWorkflow } from "orinocoflow";
#   import { compileFile } from "orinocoflow/compile";
#
#   const workflow = await compileFile("this-file.yaml");
#
#   const result = await runWorkflow(workflow, {}, {
#     handlers: {
#       fetch:    async (node, state) => ({ ...state, data: await myFetch() }),
#       process:  async (node, state) => ({ ...state, result: transform(state.data) }),
#       complete: async (node, state) => { await save(state.result); return state; },
#     },
#   });
#
#   if (result.status === "completed") console.log(result.state);
#
# \u2500\u2500\u2500 Handler rules \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
#
#   - Handlers are matched by node.type first, then node.id
#   - Always return { ...state, ...newFields } \u2014 never mutate state directly
#   - State accumulates: each step sees all fields set by previous steps
#   - Extra node fields (e.g. url: "...") are accessible as node.fieldName
#
# \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

orinocoflow_version: "1.0"
graph_id: my-pipeline       # unique identifier for this workflow
entry_point: fetch           # id of the first node to run

nodes:
  - id: fetch
    type: fetch
    # Extra fields here are passed to your handler as node.someField:
    # url: "https://api.example.com/data"

  - id: process
    type: process

  - id: complete
    type: complete

edges:
  # Standard edges always route to the next node \u2014 no conditions.
  - from: fetch
    to: process
    type: standard

  - from: process
    to: complete
    type: standard
`;
var STANDARD_YAML = `# \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
# orinocoflow \u2014 standard workflow template
# \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
#
# A pipeline with conditional branching and automatic retry limits.
# Use this when steps can succeed or fail and failures should be retried.
#
# \u2500\u2500\u2500 Quick start \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
#
#   oflow viz    <this-file>                   visualise the workflow as ASCII art
#   oflow compile <this-file>                  validate and output compiled JSON
#   oflow simulate <this-file> <mock-file>     dry-run with mock handler data
#
#   Create a mock data file:
#   oflow create mock.yaml --from <this-file>
#
# \u2500\u2500\u2500 TypeScript usage \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
#
#   import { runWorkflow } from "orinocoflow";
#   import { compileFile } from "orinocoflow/compile";
#
#   const workflow = await compileFile("this-file.yaml");
#
#   const result = await runWorkflow(workflow, {}, {
#     handlers: {
#       fetch:    async (node, state) => ({ ...state, data: await myFetch() }),
#       // validate must set state.is_valid = true or false
#       validate: async (node, state) => ({ ...state, is_valid: await check(state.data) }),
#       fix:      async (node, state) => ({ ...state, data: await repair(state.data) }),
#       publish:  async (node, state) => { await publish(state.data); return state; },
#       escalate: async (node, state) => { await alert(state); return state; },
#     },
#   });
#
#   if (result.status === "completed") console.log(result.state);
#
# \u2500\u2500\u2500 Conditional edges \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
#
#   A conditional edge reads state[field], applies the operator, and routes to
#   either routes.true or routes.false.
#
#   Supported operators: === !== < > <= >= includes startsWith endsWith
#
# \u2500\u2500\u2500 Retry limits \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
#
#   maxRetries: N     \u2014 allow the false route at most N times before escalating
#   onExhausted: id   \u2014 node to route to once retries run out
#
#   Retry counts are tracked automatically in state.__retries__ (reserved key).
#
# \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

orinocoflow_version: "1.0"
graph_id: my-pipeline
entry_point: fetch

nodes:
  - id: fetch
    type: fetch

  - id: validate
    type: validate
    # This handler must set state.is_valid = true | false

  - id: fix
    type: fix

  - id: publish
    type: publish
    # Terminal node \u2014 no outgoing edge

  - id: escalate
    type: escalate
    # Terminal node \u2014 reached when validation retries are exhausted

edges:
  - from: fetch
    to: validate
    type: standard

  # Conditional edge: routes on state.is_valid after validate runs.
  #
  #   is_valid === true  \u2192 publish
  #   is_valid === false \u2192 fix  (up to 3 times, then escalate)
  - from: validate
    type: conditional
    condition:
      field: is_valid           # key your handler sets in state
      operator: "==="
      value: true
    routes:
      "true": publish           # condition evaluated to true
      "false": fix              # condition evaluated to false
    maxRetries: 3               # allow false route at most 3 times
    onExhausted: escalate       # go here when retries run out

  - from: fix
    to: validate
    type: standard              # loops back to validate after each fix attempt
`;
function advancedMainYaml(subPath) {
  return `# \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
# orinocoflow \u2014 advanced workflow template (main)
# \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
#
# A workflow that delegates part of its logic to a reusable sub-workflow.
# Sub-workflows run inline, emit events prefixed with the parent node ID, and
# merge their final state back into the parent workflow state.
#
# \u2500\u2500\u2500 Quick start \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
#
#   oflow viz    <this-file>                   visualise the main workflow
#   oflow viz    ${subPath}  visualise the sub-workflow
#   oflow compile <this-file>                  validate the main workflow
#
# \u2500\u2500\u2500 TypeScript usage \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
#
#   import { runWorkflow } from "orinocoflow";
#   import { compileFile } from "orinocoflow/compile";
#
#   const workflow    = await compileFile("this-file.yaml");
#   const subWorkflow = await compileFile("${subPath}");
#
#   const result = await runWorkflow(workflow, {}, {
#     handlers: {
#       // Handlers for main workflow nodes:
#       intake:   async (node, state) => ({ ...state, received: true }),
#       finalise: async (node, state) => ({ ...state, done: true }),
#
#       // Handlers for sub-workflow nodes go here too (matched by type):
#       check:     async (node, state) => ({ ...state, checked: true }),
#       score:     async (node, state) => ({ ...state, score: 85 }),
#       recommend: async (node, state) => ({ ...state, recommendation: "approve" }),
#
#       // sub_workflow nodes need no handler \u2014 the engine runs them automatically.
#     },
#     registry: {
#       "review-pipeline": subWorkflow,   // key must match workflow_id below
#     },
#   });
#
# \u2500\u2500\u2500 Sub-workflow events \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
#
#   Events from sub-workflow nodes are prefixed with the parent node ID:
#     "deep-review/check", "deep-review/score", "deep-review/recommend"
#
#   The sub-workflow's final state merges into the parent state automatically.
#
# \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

orinocoflow_version: "1.0"
graph_id: my-pipeline
entry_point: intake

nodes:
  - id: intake
    type: intake

  # sub_workflow node: runs review-pipeline inline when reached.
  # Provide the compiled sub-workflow JSON in the registry option at runtime.
  - id: deep-review
    type: sub_workflow
    workflow_id: review-pipeline    # must match a key in the registry option

  - id: finalise
    type: finalise

edges:
  - from: intake
    to: deep-review
    type: standard

  - from: deep-review
    to: finalise
    type: standard
`;
}
var ADVANCED_SUB_YAML = `# \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
# orinocoflow \u2014 advanced workflow template (sub-workflow: review-pipeline)
# \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
#
# This sub-workflow is referenced by the main workflow.
# It runs when the deep-review node executes in the parent workflow.
#
# Register it at runtime:
#   registry: { "review-pipeline": await compileFile("this-file.yaml") }
#
# \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

orinocoflow_version: "1.0"
graph_id: review-pipeline     # must match workflow_id in the parent workflow
entry_point: check

nodes:
  - id: check
    type: check

  - id: score
    type: score

  - id: recommend
    type: recommend

edges:
  - from: check
    to: score
    type: standard

  - from: score
    to: recommend
    type: standard
`;
var MOCK_YAML = `# \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
# orinocoflow \u2014 mock data template
# \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
#
# Used with: oflow simulate <workflow-file> <this-file>
#
# Each key under "handlers" is a node id. The value is data the simulator
# merges into workflow state when that node runs.
#
# \u2500\u2500\u2500 Invocation suffixes \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
#
#   node:    data returned on every call (default fallback)
#   node.2:  data returned specifically on the 2nd call
#   node.3:  data returned specifically on the 3rd call
#
#   Use .N keys to simulate retry scenarios where a node first fails then
#   recovers on a later attempt:
#
#   validate:
#     is_valid: false      # fails on first call
#   validate.2:
#     is_valid: true       # succeeds on second call (after one fix attempt)
#
# \u2500\u2500\u2500 Usage \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
#
#   oflow simulate my-pipeline.yaml this-file.yaml
#
# \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

handlers:
  # Replace these with your workflow's node ids. Set the fields your
  # conditional edges depend on. Empty {} means the node returns no new state.
  step_one: {}
  step_two: {}
  step_three: {}

  # Retry example \u2014 uncomment and adapt for a node that loops:
  # step_two:
  #   result: false
  # step_two.2:
  #   result: true
`;
var TEMPLATES = {
  basic: {
    description: "Linear steps, no branching",
    generate: (outputPath) => [{ path: outputPath, content: render(BASIC_YAML, outputPath) }]
  },
  standard: {
    description: "Conditional logic and retry",
    generate: (outputPath) => [{ path: outputPath, content: render(STANDARD_YAML, outputPath) }]
  },
  advanced: {
    description: "Sub-workflows for modular composition",
    generate: (outputPath) => {
      const subPath = outputPath.replace(/(\.[^.]+)$/, "-review$1");
      return [
        { path: outputPath, content: render(advancedMainYaml(subPath), outputPath) },
        { path: subPath, content: render(ADVANCED_SUB_YAML, subPath) }
      ];
    }
  },
  mock: {
    description: "Mock data file for oflow simulate",
    generate: (outputPath) => [{ path: outputPath, content: MOCK_YAML }]
  }
};
function render(yamlContent, outputPath) {
  const ext = outputPath.split(".").pop()?.toLowerCase();
  if (ext === "json") {
    return JSON.stringify(yamlParse3(yamlContent), null, 2);
  }
  return yamlContent;
}
async function promptTemplateChoice() {
  const names = Object.keys(TEMPLATES).filter((n) => n !== "mock");
  console.log("");
  for (let i = 0; i < names.length; i++) {
    const t = TEMPLATES[names[i]];
    console.log(`  ${i + 1}  ${names[i].padEnd(12)}${t.description}`);
  }
  console.log("");
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`Select template [1-${names.length}]: `, (answer) => {
      rl.close();
      const idx = parseInt(answer.trim(), 10) - 1;
      if (idx >= 0 && idx < names.length) {
        resolve(names[idx]);
      } else {
        reject(new Error(`Invalid selection "${answer.trim()}": enter a number 1\u2013${names.length}`));
      }
    });
  });
}
function printPostCreation(files, templateName, fromWorkflow) {
  for (let i = 0; i < files.length; i++) {
    const label = i === 0 ? `${templateName} template` : "sub-workflow";
    console.log(`\u2713 Created ${files[i].path}  [${label}]`);
  }
  const workflowFile = files[0].path;
  if (templateName === "mock" || fromWorkflow) {
    const source = fromWorkflow ?? "your-pipeline.yaml";
    console.log("");
    console.log("Try this command:");
    console.log(`  oflow simulate ${source} ${workflowFile}`);
  } else {
    console.log("");
    console.log("Try these commands:");
    console.log(`  ${"oflow viz " + workflowFile}`.padEnd(50) + "\u2014 visualise your workflow");
    console.log(`  ${"oflow compile " + workflowFile}`.padEnd(50) + "\u2014 validate the schema");
    console.log(`  ${"oflow simulate " + workflowFile + " <mock-file>"}`.padEnd(50) + "\u2014 dry-run with mock data");
    console.log("");
    console.log("To scaffold a matching mock file:");
    console.log(`  oflow create mock.yaml --from ${workflowFile}`);
  }
}
async function generateMockFromWorkflow(outputPath, workflowPath) {
  const workflow = await compileFile(workflowPath);
  const handlerNodes = workflow.nodes.filter(
    (n) => n.type !== "interrupt" && n.type !== "sub_workflow"
  );
  const retrySourceIds = new Set(
    workflow.edges.filter((e) => e.type === "conditional" && e.maxRetries !== void 0).map((e) => e.from)
  );
  const ext = outputPath.split(".").pop()?.toLowerCase();
  if (ext === "json") {
    const handlers = {};
    for (const node of handlerNodes) {
      handlers[node.id] = {};
    }
    return { path: outputPath, content: JSON.stringify({ handlers }, null, 2) };
  }
  const lines = [
    `# Generated mock data for: ${workflowPath}`,
    `# Used with: oflow simulate ${workflowPath} ${outputPath}`,
    `#`,
    `# Fill in the fields your conditional edges depend on.`,
    `# Use <id>.2, <id>.3 etc. to return different data on repeated invocations.`,
    ``,
    `handlers:`
  ];
  for (const node of handlerNodes) {
    if (retrySourceIds.has(node.id)) {
      const edge = workflow.edges.find(
        (e) => e.type === "conditional" && e.from === node.id
      );
      if (edge?.type === "conditional") {
        const { field, operator, value } = edge.condition;
        const failValue = operator === "===" && value === true ? false : operator === "===" && value === false ? true : `<failing-value>`;
        lines.push(`  ${node.id}:`);
        lines.push(`    ${field}: ${JSON.stringify(failValue)}   # fails \u2192 retry`);
        lines.push(`  ${node.id}.2:`);
        lines.push(`    ${field}: ${JSON.stringify(value)}   # succeeds on second call`);
      } else {
        lines.push(`  ${node.id}: {}  # called multiple times \u2014 add .2/.3 variants as needed`);
      }
    } else {
      lines.push(`  ${node.id}: {}`);
    }
  }
  return { path: outputPath, content: lines.join("\n") + "\n" };
}
async function runCreate(args2) {
  const outputPath = args2[0];
  if (!outputPath) {
    throw new Error("Usage: oflow create <file> [--template <name>] [--from <workflow>]");
  }
  const templateFlag = args2.indexOf("--template");
  const fromFlag = args2.indexOf("--from");
  const templateName = templateFlag !== -1 ? args2[templateFlag + 1] : null;
  const fromWorkflow = fromFlag !== -1 ? args2[fromFlag + 1] : null;
  if (fromWorkflow) {
    const file = await generateMockFromWorkflow(outputPath, fromWorkflow);
    await writeFile(file.path, file.content, "utf8");
    printPostCreation([file], "mock", fromWorkflow);
    return;
  }
  let resolved = templateName;
  if (!resolved) {
    resolved = await promptTemplateChoice();
  }
  const spec = TEMPLATES[resolved];
  if (!spec) {
    throw new Error(
      `Unknown template "${resolved}". Available: ${Object.keys(TEMPLATES).join(", ")}`
    );
  }
  const files = spec.generate(outputPath);
  for (const file of files) {
    await writeFile(file.path, file.content, "utf8");
  }
  printPostCreation(files, resolved);
}

// src/cli/index.ts
var args = process.argv.slice(2);
var command = args[0];
async function main() {
  if (command === "compile") {
    const inputFile = args[1];
    if (!inputFile) {
      console.error("Usage: oflow compile <file> [--output <file>]");
      process.exit(1);
    }
    const outputFlag = args.indexOf("--output");
    const outputFile = outputFlag !== -1 ? args[outputFlag + 1] : null;
    const workflow = await compileFile(inputFile);
    const json = JSON.stringify(workflow, null, 2);
    if (outputFile) {
      await writeFile2(outputFile, json, "utf8");
    } else {
      console.log(json);
    }
  } else if (command === "viz") {
    const inputFile = args[1];
    if (!inputFile) {
      console.error("Usage: oflow viz <file>");
      process.exit(1);
    }
    const workflow = await compileFile(inputFile);
    console.log(renderViz(workflow));
  } else if (command === "simulate") {
    const workflowFile = args[1];
    const mockFile = args[2];
    if (!workflowFile || !mockFile) {
      console.error("Usage: oflow simulate <workflow> <mock-file>");
      process.exit(1);
    }
    const workflow = await compileFile(workflowFile);
    await runSimulation(workflow, mockFile);
  } else if (command === "create") {
    await runCreate(args.slice(1));
  } else {
    console.error("Usage: oflow <compile|viz|simulate|create> [args...]");
    console.error("  compile  <file> [--output <file>]");
    console.error("  viz      <file>");
    console.error("  simulate <workflow> <mock-file>");
    console.error("  create   <file> [--template basic|standard|advanced|mock]");
    console.error("  create   <mock-file> --from <workflow-file>");
    process.exit(1);
  }
}
main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
