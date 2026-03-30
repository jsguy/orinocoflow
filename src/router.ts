import type { Edge, ParallelEdge, Workflow, WorkflowState } from "./schemas.js";
import { InvalidEdgeError, WorkflowConfigurationError } from "./errors.js";

type Operator = "<" | ">" | "<=" | ">=" | "===" | "!==" | "includes" | "startsWith" | "endsWith";

/**
 * Evaluate a condition operator against two values.
 * Pure function — no eval().
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
 * Given the outgoing edges from the current node, current state, and workflow nodes,
 * return the next node ID (or undefined if terminal).
 * Mutates state.__retries__ to track per-edge retry counts.
 * Throws if the outgoing edge is parallel — use resolveOutgoing instead.
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
