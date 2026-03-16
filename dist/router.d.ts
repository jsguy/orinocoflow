import type { Edge, Workflow, WorkflowState } from "./schemas.js";
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
/**
 * Given the outgoing edges from the current node, current state, and workflow nodes,
 * return the next node ID (or undefined if terminal).
 * Mutates state.__retries__ to track per-edge retry counts.
 */
export declare function resolveNextNode(currentNodeId: string, edges: Edge[], state: WorkflowState, workflowNodes?: Workflow["nodes"]): ResolvedEdge | undefined;
