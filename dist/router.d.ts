import type { Edge, ParallelEdge, Workflow, WorkflowState } from "./schemas.js";
/**
 * Evaluate a conditional-edge operator against two values (used by the engine and for tooling).
 * Pure function — no `eval()`.
 *
 * @param fieldValue - Value read from workflow state (`state[field]`).
 * @param operator - Comparison operator (see engine docs for supported names).
 * @param conditionValue - Right-hand side from the edge definition.
 * @returns Whether the condition passes.
 * @example
 * ```ts
 * import { evaluateOperator } from "orinocoflow";
 *
 * evaluateOperator(2, "<", 5); // true
 * evaluateOperator("hello", "startsWith", "he"); // true
 * ```
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
 *
 * @param currentNodeId - Node id to leave from.
 * @param edges - Full workflow edge list.
 * @param state - Current workflow state (may be mutated for retry bookkeeping).
 * @param workflowNodes - Optional nodes list (for `onExhausted` validation).
 * @returns Parallel fork descriptor, single resolved edge, or `undefined` if terminal.
 * @example
 * ```ts
 * import { parse, resolveOutgoing } from "orinocoflow";
 *
 * const wf = parse({
 *   graph_id: "g",
 *   entry_point: "a",
 *   nodes: [
 *     { id: "a", type: "t" },
 *     { id: "b", type: "t" },
 *   ],
 *   edges: [{ from: "a", to: "b", type: "standard" }],
 * });
 * const out = resolveOutgoing("a", wf.edges, {}, wf.nodes);
 * // out.kind === "single" && out.resolution.nextNodeId === "b"
 * ```
 */
export declare function resolveOutgoing(currentNodeId: string, edges: Edge[], state: WorkflowState, workflowNodes?: Workflow["nodes"]): OutgoingResolution | undefined;
/**
 * Return the next node after a **non-parallel** outgoing edge (standard or conditional).
 * Mutates `state.__retries__` for conditional retry tracking.
 * Throws if the outgoing edge is parallel — use {@link resolveOutgoing} instead.
 *
 * @param currentNodeId - Current node id.
 * @param edges - Full workflow edge list.
 * @param state - Current workflow state.
 * @param workflowNodes - Optional nodes list.
 * @returns Next step or `undefined` if no outgoing edge.
 * @example
 * ```ts
 * import { parse, resolveNextNode } from "orinocoflow";
 *
 * const wf = parse({
 *   graph_id: "g",
 *   entry_point: "a",
 *   nodes: [
 *     { id: "a", type: "t" },
 *     { id: "b", type: "t" },
 *   ],
 *   edges: [{ from: "a", to: "b", type: "standard" }],
 * });
 * const next = resolveNextNode("a", wf.edges, {}, wf.nodes);
 * // next?.nextNodeId === "b"
 * ```
 */
export declare function resolveNextNode(currentNodeId: string, edges: Edge[], state: WorkflowState, workflowNodes?: Workflow["nodes"]): ResolvedEdge | undefined;
