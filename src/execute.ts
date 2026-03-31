import type {
  Workflow,
  WorkflowState,
  WorkflowEvent,
  WorkflowNode,
  WorkflowResult,
  SuspendedExecution,
  EnteredViaEdge,
} from "./schemas.js";
import { parse } from "./schemas.js";
import { resolveNextNode, resolveOutgoing } from "./router.js";
import {
  NodeNotFoundError,
  HandlerError,
  WorkflowCycleError,
  WorkflowAbortedError,
  SubWorkflowNotFoundError,
  WorkflowConfigurationError,
  ParallelBranchDidNotConvergeError,
} from "./errors.js";
import { validateParallelWorkflow } from "./validate.js";

/**
 * Options for {@link runWorkflow} and {@link runWorkflowStream}. Handlers are keyed by **node `type`**, not node id.
 *
 * @example
 * ```ts
 * import { parse, runWorkflow } from "orinocoflow";
 *
 * const wf = parse({
 *   graph_id: "g",
 *   entry_point: "n",
 *   nodes: [{ id: "n", type: "alpha" }],
 *   edges: [],
 * });
 * await runWorkflow(wf, {}, {
 *   handlers: { alpha: async (_node, state) => ({ ...state, ok: true }) },
 *   onEvent: (e) => console.log(e.type),
 * });
 * ```
 */
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
  /** How to merge branch end states after a parallel fork. Default "strict".
   *  Pass a function for full control: receives (branchStates, preForkState) and returns merged state. */
  parallelMerge?: "strict" | "overwrite" | ((branchStates: WorkflowState[], preForkState: WorkflowState) => WorkflowState);
  /** @internal abort when another parallel branch fails (fail-fast) */
  _parallelSiblingAbort?: AbortSignal;
}

/**
 * Options for {@link resumeWorkflow}. Same handler/registry/event shape as {@link RunOptions}.
 */
export interface ResumeOptions {
  /** Additional state to merge onto the snapshot state (takes precedence) */
  state?: WorkflowState;
  handlers: RunOptions["handlers"];
  registry?: RunOptions["registry"];
  maxSteps?: RunOptions["maxSteps"];
  signal?: RunOptions["signal"];
  onEvent?: RunOptions["onEvent"];
}

function cloneWorkflowStateForParallel(state: WorkflowState): WorkflowState {
  try {
    return structuredClone(state);
  } catch {
    throw new WorkflowConfigurationError(
      "Parallel execution requires structuredClone-able workflow state (no functions, symbols, or non-cloneable values).",
    );
  }
}

function mergeParallelBranchStates(
  states: WorkflowState[],
  mode: RunOptions["parallelMerge"],
  preForkState?: WorkflowState,
): WorkflowState {
  if (states.length === 0) return {};
  if (typeof mode === "function") {
    return mode(states, preForkState!);
  }
  if (mode === "overwrite") {
    return Object.assign({}, ...states);
  }
  const out: WorkflowState = {};
  for (const s of states) {
    for (const key of Object.keys(s)) {
      if (Object.prototype.hasOwnProperty.call(out, key)) {
        if (!Object.is(out[key], s[key])) {
          throw new WorkflowConfigurationError(
            `Parallel merge conflict on top-level state key "${key}" (strict mode).`,
          );
        }
      } else {
        out[key] = s[key];
      }
    }
  }
  return out;
}

/**
 * Run a single parallel branch from `branchEntry` until the next node would be `joinId` (join not executed).
 */
async function runBranchUntilJoin(
  workflow: Workflow,
  branchEntry: string,
  joinId: string,
  branchInitialState: WorkflowState,
  options: RunOptions,
  emit: (event: WorkflowEvent) => void,
  forkNodeId: string,
  branchNodePrefix: (nodeId: string) => string,
  joinNodeIdPrefixed: string,
  stepsRef: { n: number },
  maxSteps: number,
): Promise<WorkflowState> {
  const { handlers, signal, _parallelSiblingAbort } = options;

  let currentNodeId: string | undefined = branchEntry;
  let currentState: WorkflowState = branchInitialState;

  while (currentNodeId !== undefined) {
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
        `Interrupt node "${node.id}" is not allowed inside a parallel branch (v1).`,
      );
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
        throw new WorkflowConfigurationError(
          `Sub-workflow node "${node.id}" is not allowed inside a parallel branch (v1).`,
        );
      }
      const handler = handlers[node.type] ?? handlers[node.id];
      if (!handler) {
        throw new HandlerError(
          node.id,
          new Error(`No handler registered for node type "${node.type}" or id "${node.id}"`),
        );
      }
      currentState = await handler(node, currentState);
    } catch (err) {
      if (
        err instanceof WorkflowAbortedError ||
        err instanceof WorkflowCycleError ||
        err instanceof SubWorkflowNotFoundError ||
        err instanceof WorkflowConfigurationError
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

    const outgoing = resolveOutgoing(currentNodeId, workflow.edges, currentState, workflow.nodes);

    if (outgoing === undefined) {
      throw new ParallelBranchDidNotConvergeError(branchEntry, joinId, currentNodeId);
    }
    if (outgoing.kind === "parallel") {
      throw new WorkflowConfigurationError(
        `Nested parallel from "${currentNodeId}" inside branch "${branchEntry}" is invalid.`,
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
        ...(resolution.retriesExhausted ? { retriesExhausted: true, onExhausted: resolution.onExhausted } : {}),
      });
      return currentState;
    }

    emit({
      type: "edge_taken",
      from: prefixedNodeId,
      to: branchNodePrefix(resolution.nextNodeId),
      edgeType: resolution.edgeType,
      conditionResult: resolution.conditionResult,
      ...(resolution.retriesExhausted ? { retriesExhausted: true, onExhausted: resolution.onExhausted } : {}),
    });
    currentNodeId = resolution.nextNodeId;
  }

  throw new ParallelBranchDidNotConvergeError(branchEntry, joinId, undefined);
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
  stepsRef?: { n: number },
): Promise<WorkflowResult> {
  const {
    handlers,
    registry = {},
    maxSteps = 1000,
    signal,
    _nodeIdPrefix = "",
    parallelMerge = "strict",
    _parallelSiblingAbort,
  } = options;

  const prefix = (id: string) => (_nodeIdPrefix ? `${_nodeIdPrefix}/${id}` : id);
  const workflowStart = Date.now();
  const steps = stepsRef ?? { n: 0 };

  emit({
    type: "workflow_start",
    workflowId: workflow.graph_id,
    entryPoint: prefix(entryNodeId ?? workflow.entry_point),
  });

  let currentNodeId: string | undefined = entryNodeId ?? workflow.entry_point;
  let currentState: WorkflowState = { ...initialState };
  // Last single-edge routing in this execution (unprefixed ids); used when suspending at an interrupt.
  let enteredViaEdge: EnteredViaEdge | undefined;

  while (currentNodeId !== undefined) {
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
      const snapshot: SuspendedExecution = {
        workflowId: workflow.graph_id,
        suspendedAtNodeId: node.id,
        state: currentState,
        workflowSnapshot: workflow,
        ...(enteredViaEdge !== undefined ? { enteredViaEdge } : {}),
      };
      emit({ type: "workflow_suspended", nodeId: prefixedNodeId });
      return { status: "suspended", snapshot, trace: [] };
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
        validateParallelWorkflow(subWorkflow);
        const subResult = await _execute(
          subWorkflow,
          currentState,
          { ...options, signal, _nodeIdPrefix: prefixedNodeId, _parallelSiblingAbort },
          emit,
          undefined,
          steps,
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

    const outgoing = resolveOutgoing(currentNodeId, workflow.edges, currentState, workflow.nodes);

    if (outgoing?.kind === "parallel") {
      const { edge } = outgoing;
      const joinPrefixed = prefix(edge.join);
      emit({
        type: "parallel_fork",
        from: prefixedNodeId,
        targets: edge.targets,
        join: joinPrefixed,
      });

      const parallelFail = new AbortController();
      const onUserAbort = () => parallelFail.abort();
      if (signal) {
        if (signal.aborted) parallelFail.abort();
        else signal.addEventListener("abort", onUserAbort, { once: true });
      }

      const branchOptions: RunOptions = {
        ...options,
        _parallelSiblingAbort: parallelFail.signal,
      };

      const branchNodePrefix = (nid: string) => prefix(`${edge.from}/${nid}`);

      const runOneBranch = async (target: string) => {
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
            maxSteps,
          );
        } catch (err) {
          emit({
            type: "parallel_branch_error",
            branchEntry: target,
            join: joinPrefixed,
            error: err instanceof Error ? err : new Error(String(err)),
          });
          parallelFail.abort();
          throw err;
        }
      };

      let branchStates: WorkflowState[];
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
          error: err instanceof Error ? err : new Error(String(err)),
        });
        throw err;
      }

      emit({
        type: "parallel_join",
        from: prefixedNodeId,
        join: joinPrefixed,
        targets: edge.targets.map((t) => branchNodePrefix(t)),
      });

      currentNodeId = edge.join;
      continue;
    }

    if (outgoing?.kind === "single") {
      const resolution = outgoing.resolution;
      enteredViaEdge = {
        from: currentNodeId!,
        to: resolution.nextNodeId,
        edgeType: resolution.edgeType,
        ...(resolution.conditionResult !== undefined ? { conditionResult: resolution.conditionResult } : {}),
        ...(resolution.retriesExhausted ? { retriesExhausted: true, onExhausted: resolution.onExhausted } : {}),
      };
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

  return { status: "completed", state: currentState, trace: [] };
}

/**
 * Execute a workflow from `entry_point` to completion, suspension, or error.
 * Events are collected in the returned `trace`; also pass `onEvent` for live callbacks.
 *
 * @param workflow - Parsed workflow (use `parse()` or `compileFile()` from `"orinocoflow/compile"`).
 * @param initialState - Arbitrary JSON-serializable state passed to the first node.
 * @param options - Handlers and optional streaming / limits / parallel merge.
 * @returns Completed or suspended result with full event trace.
 * @example
 * ```ts
 * import { parse, runWorkflow } from "orinocoflow";
 *
 * const workflow = parse({
 *   graph_id: "g",
 *   entry_point: "a",
 *   nodes: [
 *     { id: "a", type: "t" },
 *     { id: "b", type: "t" },
 *   ],
 *   edges: [{ from: "a", to: "b", type: "standard" }],
 * });
 * const { status, state } = await runWorkflow(workflow, { n: 1 }, {
 *   handlers: { t: async (_node, s) => ({ ...s, n: (s.n as number) + 1 }) },
 * });
 * ```
 */
export async function runWorkflow(
  workflow: Workflow,
  initialState: WorkflowState,
  options: RunOptions,
): Promise<WorkflowResult> {
  validateParallelWorkflow(workflow);
  const trace: WorkflowEvent[] = [];
  const result = await _execute(workflow, initialState, options, (event) => {
    trace.push(event);
    options.onEvent?.(event);
  });
  return { ...result, trace };
}

/**
 * Resume a previously suspended workflow from its snapshot.
 * Optionally merge additional state (`options.state` takes precedence over `snapshot.state`).
 *
 * @param snapshot - Persisted {@link SuspendedExecution} from a prior run.
 * @param options - Handlers and optional streaming (same as run).
 * @returns Completed or suspended result with trace.
 * @example
 * ```ts
 * import { resumeWorkflow } from "orinocoflow";
 * import type { SuspendedExecution } from "orinocoflow";
 *
 * async function resume(snap: SuspendedExecution) {
 *   return resumeWorkflow(snap, {
 *     handlers: { myType: async (_n, s) => s },
 *   });
 * }
 * ```
 */
export async function resumeWorkflow(
  snapshot: SuspendedExecution,
  options: ResumeOptions,
): Promise<WorkflowResult> {
  const workflow = snapshot.workflowSnapshot;
  validateParallelWorkflow(workflow);
  const mergedState: WorkflowState = { ...snapshot.state, ...(options.state ?? {}) };

  const resolution = resolveNextNode(snapshot.suspendedAtNodeId, workflow.edges, mergedState, workflow.nodes);
  const entryNodeId = resolution?.nextNodeId;

  const trace: WorkflowEvent[] = [];
  const emit = (event: WorkflowEvent) => {
    trace.push(event);
    options.onEvent?.(event);
  };

  emit({ type: "workflow_resume" });

  if (entryNodeId === undefined) {
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
 * Same execution as {@link runWorkflow}, but events are consumed with `for await` instead of `onEvent`.
 *
 * @param workflow - Parsed workflow.
 * @param initialState - Initial state.
 * @param options - Handlers and options (onEvent is optional; stream is primary).
 * @returns Async iterable of {@link WorkflowEvent}.
 * @example
 * ```ts
 * import { parse, runWorkflowStream } from "orinocoflow";
 *
 * const workflow = parse({
 *   graph_id: "g",
 *   entry_point: "a",
 *   nodes: [{ id: "a", type: "t" }],
 *   edges: [],
 * });
 * for await (const event of runWorkflowStream(workflow, {}, { handlers: { t: async (_n, s) => s } } })) {
 *   if (event.type === "workflow_complete") console.log(event.finalState);
 * }
 * ```
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

      validateParallelWorkflow(workflow);
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
