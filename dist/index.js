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
function parseNodeSpec(raw) {
  return NodeSpecSchema.parse(raw);
}

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
function resolveNextNode(currentNodeId, edges, state, workflowNodes) {
  const outgoing = resolveOutgoing(currentNodeId, edges, state, workflowNodes);
  if (outgoing === void 0) return void 0;
  if (outgoing.kind === "parallel") {
    throw new WorkflowConfigurationError(
      `Node "${currentNodeId}" has a parallel outgoing edge; use resolveOutgoing to handle fork/join.`
    );
  }
  return outgoing.resolution;
}

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
        workflowSnapshot: workflow
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
async function resumeWorkflow(snapshot, options) {
  const workflow = snapshot.workflowSnapshot;
  validateParallelWorkflow(workflow);
  const mergedState = { ...snapshot.state, ...options.state ?? {} };
  const resolution = resolveNextNode(snapshot.suspendedAtNodeId, workflow.edges, mergedState, workflow.nodes);
  const entryNodeId = resolution?.nextNodeId;
  const trace = [];
  const emit = (event) => {
    trace.push(event);
    options.onEvent?.(event);
  };
  emit({ type: "workflow_resume" });
  if (entryNodeId === void 0) {
    emit({ type: "workflow_complete", finalState: mergedState, durationMs: 0 });
    return { status: "completed", state: mergedState, trace };
  }
  const runOptions = {
    handlers: options.handlers,
    registry: options.registry,
    maxSteps: options.maxSteps,
    signal: options.signal,
    onEvent: options.onEvent
  };
  const result = await _execute(workflow, mergedState, runOptions, emit, entryNodeId);
  return { ...result, trace };
}
function runWorkflowStream(workflow, initialState, options) {
  return {
    [Symbol.asyncIterator]() {
      const queue = [];
      const pending = [];
      let done = false;
      let error;
      validateParallelWorkflow(workflow);
      _execute(workflow, initialState, options, (event) => {
        if (pending.length > 0) {
          pending.shift().resolve({ value: event, done: false });
        } else {
          queue.push(event);
        }
      }).then(
        () => {
          done = true;
          for (const { resolve } of pending.splice(0)) {
            resolve({ value: void 0, done: true });
          }
        },
        (err) => {
          done = true;
          error = err;
          for (const { reject } of pending.splice(0)) {
            reject(err);
          }
        }
      );
      return {
        next() {
          if (queue.length > 0) {
            return Promise.resolve({ value: queue.shift(), done: false });
          }
          if (done) {
            if (error !== void 0) return Promise.reject(error);
            return Promise.resolve({ value: void 0, done: true });
          }
          return new Promise((resolve, reject) => {
            pending.push({ resolve, reject });
          });
        }
      };
    }
  };
}

// src/store.ts
var MemorySessionStore = class {
  store = /* @__PURE__ */ new Map();
  async get(sessionId) {
    return this.store.get(sessionId);
  }
  async set(sessionId, snapshot) {
    this.store.set(sessionId, snapshot);
  }
  async delete(sessionId) {
    this.store.delete(sessionId);
  }
};
export {
  ConditionalEdgeSchema,
  EdgeSchema,
  HandlerError,
  InvalidEdgeError,
  MemorySessionStore,
  NodeNotFoundError,
  NodeSpecSchema,
  ParallelBranchDidNotConvergeError,
  ParallelEdgeSchema,
  StandardEdgeSchema,
  SubWorkflowNotFoundError,
  WorkflowAbortedError,
  WorkflowConfigurationError,
  WorkflowCycleError,
  WorkflowNodeSchema,
  WorkflowSchema,
  evaluateOperator,
  parse,
  parseNodeSpec,
  resolveNextNode,
  resolveOutgoing,
  resumeWorkflow,
  runWorkflow,
  runWorkflowStream,
  validateParallelWorkflow
};
