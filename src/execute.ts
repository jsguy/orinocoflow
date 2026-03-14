import type { Workflow, WorkflowState, WorkflowEvent, WorkflowNode, WorkflowResult, SuspendedExecution } from "./schemas.js";
import { parse } from "./schemas.js";
import { resolveNextNode } from "./router.js";
import {
  NodeNotFoundError,
  HandlerError,
  WorkflowCycleError,
  WorkflowAbortedError,
  SubWorkflowNotFoundError,
} from "./errors.js";

export interface RunOptions {
  handlers: Record<
    string,
    (node: WorkflowNode, state: WorkflowState) => Promise<WorkflowState>
  >;
  /** workflow_id → raw JSON for sub_workflow nodes */
  registry?: Record<string, unknown>;
  /** Cycle guard. Default: 1000 */
  maxSteps?: number;
  /** Cancellation signal */
  signal?: AbortSignal;
  /** Called with each event as execution proceeds (callback-based streaming) */
  onEvent?: (event: WorkflowEvent) => void;
  /** Internal: prefix for sub-workflow event nodeIds */
  _nodeIdPrefix?: string;
}

export interface ResumeOptions {
  /** Additional state to merge onto the snapshot state (takes precedence) */
  state?: WorkflowState;
  handlers: RunOptions["handlers"];
  registry?: RunOptions["registry"];
  maxSteps?: RunOptions["maxSteps"];
  signal?: RunOptions["signal"];
  onEvent?: RunOptions["onEvent"];
}

/**
 * Core execution engine — plain async/await, no generators.
 * Calls emit synchronously for each WorkflowEvent as it occurs.
 * Returns WorkflowResult (completed or suspended).
 */
async function _execute(
  workflow: Workflow,
  initialState: WorkflowState,
  options: RunOptions,
  emit: (event: WorkflowEvent) => void,
  entryNodeId?: string,
): Promise<WorkflowResult> {
  const {
    handlers,
    registry = {},
    maxSteps = 1000,
    signal,
    _nodeIdPrefix = "",
  } = options;

  const prefix = (id: string) => (_nodeIdPrefix ? `${_nodeIdPrefix}/${id}` : id);
  const workflowStart = Date.now();
  let steps = 0;

  emit({
    type: "workflow_start",
    workflowId: workflow.graph_id,
    entryPoint: prefix(entryNodeId ?? workflow.entry_point),
  });

  let currentNodeId: string | undefined = entryNodeId ?? workflow.entry_point;
  let currentState: WorkflowState = { ...initialState };

  while (currentNodeId !== undefined) {
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

    // ── Interrupt node: suspend execution ─────────────────────────────────────
    if (node.type === "interrupt") {
      const snapshot: SuspendedExecution = {
        workflowId: workflow.graph_id,
        suspendedAtNodeId: node.id,
        state: currentState,
        workflowSnapshot: workflow,
      };
      emit({ type: "workflow_suspended", nodeId: prefixedNodeId });
      return { status: "suspended", snapshot, trace: [] }; // trace assembled by caller
    }

    emit({
      type: "node_start",
      nodeId: prefixedNodeId,
      nodeType: node.type,
      state: currentState,
    });

    const nodeStart = Date.now();

    try {
      if (node.type === "sub_workflow") {
        const subWorkflowId = (node as WorkflowNode & { workflow_id?: string }).workflow_id;
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
          emit,
        );
        if (subResult.status === "suspended") {
          // Propagate suspension upward
          return subResult;
        }
        currentState = subResult.state;
      } else {
        const handler = handlers[node.type] ?? handlers[node.id];
        if (!handler) {
          throw new HandlerError(
            node.id,
            new Error(`No handler registered for node type "${node.type}" or id "${node.id}"`),
          );
        }
        currentState = await handler(node, currentState);
      }
    } catch (err) {
      if (
        err instanceof WorkflowAbortedError ||
        err instanceof WorkflowCycleError ||
        err instanceof SubWorkflowNotFoundError
      ) {
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
      durationMs: Date.now() - nodeStart,
    });

    const resolution = resolveNextNode(currentNodeId, workflow.edges, currentState, workflow.nodes);

    if (resolution !== undefined) {
      emit({
        type: "edge_taken",
        from: prefixedNodeId,
        to: prefix(resolution.nextNodeId),
        edgeType: resolution.edgeType,
        conditionResult: resolution.conditionResult,
        ...(resolution.retriesExhausted ? { retriesExhausted: true, onExhausted: resolution.onExhausted } : {}),
      });
      currentNodeId = resolution.nextNodeId;
    } else {
      currentNodeId = undefined;
    }
  }

  emit({
    type: "workflow_complete",
    finalState: currentState,
    durationMs: Date.now() - workflowStart,
  });

  return { status: "completed", state: currentState, trace: [] }; // trace assembled by caller
}

/**
 * Run a workflow and collect all events into a trace.
 * Pass onEvent in options to receive events as they happen (callback interface).
 */
export async function runWorkflow(
  workflow: Workflow,
  initialState: WorkflowState,
  options: RunOptions,
): Promise<WorkflowResult> {
  const trace: WorkflowEvent[] = [];
  const result = await _execute(workflow, initialState, options, (event) => {
    trace.push(event);
    options.onEvent?.(event);
  });
  return { ...result, trace };
}

/**
 * Resume a previously suspended workflow from its snapshot.
 * Optionally merge additional state (options.state takes precedence over snapshot.state).
 */
export async function resumeWorkflow(
  snapshot: SuspendedExecution,
  options: ResumeOptions,
): Promise<WorkflowResult> {
  const workflow = snapshot.workflowSnapshot;
  const mergedState: WorkflowState = { ...snapshot.state, ...(options.state ?? {}) };

  // Resolve the entry node: the successor of the interrupt node
  const resolution = resolveNextNode(snapshot.suspendedAtNodeId, workflow.edges, mergedState, workflow.nodes);
  const entryNodeId = resolution?.nextNodeId;

  const trace: WorkflowEvent[] = [];
  const emit = (event: WorkflowEvent) => {
    trace.push(event);
    options.onEvent?.(event);
  };

  emit({ type: "workflow_resume" });

  if (entryNodeId === undefined) {
    // Interrupt was the terminal node
    emit({ type: "workflow_complete", finalState: mergedState, durationMs: 0 });
    return { status: "completed", state: mergedState, trace };
  }

  const runOptions: RunOptions = {
    handlers: options.handlers,
    registry: options.registry,
    maxSteps: options.maxSteps,
    signal: options.signal,
    onEvent: options.onEvent,
  };

  const result = await _execute(workflow, mergedState, runOptions, emit, entryNodeId);
  return { ...result, trace };
}

/**
 * Run a workflow and stream events as an AsyncIterable (for-await interface).
 */
export function runWorkflowStream(
  workflow: Workflow,
  initialState: WorkflowState,
  options: RunOptions,
): AsyncIterable<WorkflowEvent> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<WorkflowEvent> {
      const queue: WorkflowEvent[] = [];
      const pending: Array<{
        resolve: (r: IteratorResult<WorkflowEvent>) => void;
        reject: (e: unknown) => void;
      }> = [];
      let done = false;
      let error: unknown;

      _execute(workflow, initialState, options, (event) => {
        if (pending.length > 0) {
          pending.shift()!.resolve({ value: event, done: false });
        } else {
          queue.push(event);
        }
      }).then(
        () => {
          done = true;
          for (const { resolve } of pending.splice(0)) {
            resolve({ value: undefined as any, done: true });
          }
        },
        (err) => {
          done = true;
          error = err;
          for (const { reject } of pending.splice(0)) {
            reject(err);
          }
        },
      );

      return {
        next(): Promise<IteratorResult<WorkflowEvent>> {
          if (queue.length > 0) {
            return Promise.resolve({ value: queue.shift()!, done: false });
          }
          if (done) {
            if (error !== undefined) return Promise.reject(error);
            return Promise.resolve({ value: undefined as any, done: true });
          }
          return new Promise((resolve, reject) => {
            pending.push({ resolve, reject });
          });
        },
      };
    },
  };
}
