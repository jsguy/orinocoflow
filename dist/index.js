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
function resolveNextNode(currentNodeId, edges, state, workflowNodes) {
  const outgoing = edges.filter((e) => e.from === currentNodeId);
  if (outgoing.length === 0) return void 0;
  const edge = outgoing[0];
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

// src/execute.ts
async function _execute(workflow, initialState, options, emit, entryNodeId) {
  const {
    handlers,
    registry = {},
    maxSteps = 1e3,
    signal,
    _nodeIdPrefix = ""
  } = options;
  const prefix = (id) => _nodeIdPrefix ? `${_nodeIdPrefix}/${id}` : id;
  const workflowStart = Date.now();
  let steps = 0;
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
    if (++steps > maxSteps) {
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
        const subResult = await _execute(
          subWorkflow,
          currentState,
          { handlers, registry, maxSteps: maxSteps - steps, signal, _nodeIdPrefix: prefixedNodeId },
          emit
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
    const resolution = resolveNextNode(currentNodeId, workflow.edges, currentState, workflow.nodes);
    if (resolution !== void 0) {
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
  const trace = [];
  const result = await _execute(workflow, initialState, options, (event) => {
    trace.push(event);
    options.onEvent?.(event);
  });
  return { ...result, trace };
}
async function resumeWorkflow(snapshot, options) {
  const workflow = snapshot.workflowSnapshot;
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
  StandardEdgeSchema,
  SubWorkflowNotFoundError,
  WorkflowAbortedError,
  WorkflowConfigurationError,
  WorkflowCycleError,
  WorkflowNodeSchema,
  WorkflowSchema,
  evaluateOperator,
  parse,
  resolveNextNode,
  resumeWorkflow,
  runWorkflow,
  runWorkflowStream
};
