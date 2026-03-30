import type { Workflow, WorkflowState, WorkflowEvent, WorkflowNode, WorkflowResult, SuspendedExecution } from "./schemas.js";
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
    /** How to merge branch end states after a parallel fork. Default "strict". */
    parallelMerge?: "strict" | "overwrite";
    /** @internal abort when another parallel branch fails (fail-fast) */
    _parallelSiblingAbort?: AbortSignal;
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
 * Run a workflow and collect all events into a trace.
 * Pass onEvent in options to receive events as they happen (callback interface).
 */
export declare function runWorkflow(workflow: Workflow, initialState: WorkflowState, options: RunOptions): Promise<WorkflowResult>;
/**
 * Resume a previously suspended workflow from its snapshot.
 * Optionally merge additional state (options.state takes precedence over snapshot.state).
 */
export declare function resumeWorkflow(snapshot: SuspendedExecution, options: ResumeOptions): Promise<WorkflowResult>;
/**
 * Run a workflow and stream events as an AsyncIterable (for-await interface).
 */
export declare function runWorkflowStream(workflow: Workflow, initialState: WorkflowState, options: RunOptions): AsyncIterable<WorkflowEvent>;
