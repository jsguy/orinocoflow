import type { Edge, ParallelEdge, Workflow, WorkflowState } from "./schemas.js";
import { InvalidEdgeError, WorkflowConfigurationError } from "./errors.js";

type Operator = "<" | ">" | "<=" | ">=" | "===" | "!==" | "includes" | "startsWith" | "endsWith";

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
export function evaluateOperator(
  fieldValue: unknown,
  operator: string,
  conditionValue: unknown,
): boolean {
  switch (operator as Operator) {
    case "<":
      return (fieldValue as number) < (conditionValue as number);
    case ">":
      return (fieldValue as number) > (conditionValue as number);
    case "<=":
      return (fieldValue as number) <= (conditionValue as number);
    case ">=":
      return (fieldValue as number) >= (conditionValue as number);
    case "===":
      return fieldValue === conditionValue;
    case "!==":
      return fieldValue !== conditionValue;
    case "includes":
      if (typeof fieldValue === "string") {
        return fieldValue.includes(conditionValue as string);
      }
      if (Array.isArray(fieldValue)) {
        return fieldValue.includes(conditionValue);
      }
      return false;
    case "startsWith":
      return typeof fieldValue === "string" && fieldValue.startsWith(conditionValue as string);
    case "endsWith":
      return typeof fieldValue === "string" && fieldValue.endsWith(conditionValue as string);
    default:
      throw new InvalidEdgeError(`Unknown operator: "${operator}"`);
  }
}

export type ResolvedEdge =
  | { nextNodeId: string; edgeType: "standard"; conditionResult?: undefined; retriesExhausted?: undefined }
  | { nextNodeId: string; edgeType: "conditional"; conditionResult: boolean; retriesExhausted?: boolean; onExhausted?: string };

export type OutgoingResolution =
  | { kind: "single"; resolution: ResolvedEdge }
  | { kind: "parallel"; edge: ParallelEdge };

function resolveSingleOutgoingEdge(
  edge: Exclude<Edge, { type: "parallel" }>,
  state: WorkflowState,
  workflowNodes: Workflow["nodes"] | undefined,
): ResolvedEdge {
  if (edge.type === "standard") {
    return { nextNodeId: edge.to, edgeType: "standard" };
  }

  const conditionResult = evaluateOperator(
    state[edge.condition.field],
    edge.condition.operator,
    edge.condition.value,
  );
  const loopbackTarget = conditionResult ? edge.routes.true : edge.routes.false;

  if (edge.maxRetries !== undefined) {
    const retryKey = `${edge.from}:${loopbackTarget}`;
    const retries = (state.__retries__ as Record<string, number> | undefined) ?? {};
    const count = retries[retryKey] ?? 0;

    if (count >= edge.maxRetries) {
      if (!edge.onExhausted) {
        throw new WorkflowConfigurationError(
          `Edge from "${edge.from}" has maxRetries=${edge.maxRetries} but no onExhausted node defined.`,
        );
      }
      if (workflowNodes && !workflowNodes.find((n) => n.id === edge.onExhausted)) {
        throw new WorkflowConfigurationError(
          `Edge from "${edge.from}" references onExhausted node "${edge.onExhausted}" which does not exist in the workflow.`,
        );
      }
      return {
        nextNodeId: edge.onExhausted,
        edgeType: "conditional",
        conditionResult,
        retriesExhausted: true,
        onExhausted: edge.onExhausted,
      };
    }

    state.__retries__ = { ...retries, [retryKey]: count + 1 };
  }

  return { nextNodeId: loopbackTarget, edgeType: "conditional", conditionResult };
}

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
export function resolveOutgoing(
  currentNodeId: string,
  edges: Edge[],
  state: WorkflowState,
  workflowNodes?: Workflow["nodes"],
): OutgoingResolution | undefined {
  const outgoing = edges.filter((e) => e.from === currentNodeId);

  if (outgoing.length === 0) return undefined;
  if (outgoing.length > 1) {
    throw new WorkflowConfigurationError(
      `Node "${currentNodeId}" has ${outgoing.length} outgoing edges; exactly one is required.`,
    );
  }

  const edge = outgoing[0];
  if (edge.type === "parallel") {
    return { kind: "parallel", edge };
  }

  return { kind: "single", resolution: resolveSingleOutgoingEdge(edge, state, workflowNodes) };
}

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
export function resolveNextNode(
  currentNodeId: string,
  edges: Edge[],
  state: WorkflowState,
  workflowNodes?: Workflow["nodes"],
): ResolvedEdge | undefined {
  const outgoing = resolveOutgoing(currentNodeId, edges, state, workflowNodes);
  if (outgoing === undefined) return undefined;
  if (outgoing.kind === "parallel") {
    throw new WorkflowConfigurationError(
      `Node "${currentNodeId}" has a parallel outgoing edge; use resolveOutgoing to handle fork/join.`,
    );
  }
  return outgoing.resolution;
}
