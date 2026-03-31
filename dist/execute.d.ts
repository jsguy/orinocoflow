import type { Workflow, WorkflowState, WorkflowEvent, WorkflowNode, WorkflowResult, SuspendedExecution } from "./schemas.js";
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
    handlers: Record<string, (node: WorkflowNode, state: WorkflowState) => Promise<WorkflowState>>;
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
export declare function runWorkflow(workflow: Workflow, initialState: WorkflowState, options: RunOptions): Promise<WorkflowResult>;
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
export declare function resumeWorkflow(snapshot: SuspendedExecution, options: ResumeOptions): Promise<WorkflowResult>;
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
export declare function runWorkflowStream(workflow: Workflow, initialState: WorkflowState, options: RunOptions): AsyncIterable<WorkflowEvent>;
