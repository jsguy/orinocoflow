import type { Edge, ParallelEdge, Workflow, WorkflowState } from "./schemas.js";
/**
 * Evaluate a condition operator against two values.
 * Pure function — no eval().
 */
export declare function evaluateOperator(fieldValue: unknown, operator: string, conditionValue: unknown): boolean;
export type ResolvedEdge = {
    nextNodeId: string;
    edgeType: "standard";
    conditionResult?: undefined;
    retriesExhausted?: undefined;
} | {
    nextNodeId: string;
    edgeType: "conditional";
    conditionResult: boolean;
    retriesExhausted?: boolean;
    onExhausted?: string;
};
export type OutgoingResolution = {
    kind: "single";
    resolution: ResolvedEdge;
} | {
    kind: "parallel";
    edge: ParallelEdge;
};
/**
 * Resolve outgoing edges from the current node: either a single standard/conditional route or a parallel fork.
 * At most one edge per `from` is required; multiple outgoing edges throw.
 */
export declare function resolveOutgoing(currentNodeId: string, edges: Edge[], state: WorkflowState, workflowNodes?: Workflow["nodes"]): OutgoingResolution | undefined;
/**
 * Given the outgoing edges from the current node, current state, and workflow nodes,
 * return the next node ID (or undefined if terminal).
 * Mutates state.__retries__ to track per-edge retry counts.
 * Throws if the outgoing edge is parallel — use resolveOutgoing instead.
 */
export declare function resolveNextNode(currentNodeId: string, edges: Edge[], state: WorkflowState, workflowNodes?: Workflow["nodes"]): ResolvedEdge | undefined;
