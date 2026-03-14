import type { Edge, Workflow, WorkflowState } from "./schemas.js";
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

/**
 * Given the outgoing edges from the current node, current state, and workflow nodes,
 * return the next node ID (or undefined if terminal).
 * Mutates state.__retries__ to track per-edge retry counts.
 */
export function resolveNextNode(
  currentNodeId: string,
  edges: Edge[],
  state: WorkflowState,
  workflowNodes?: Workflow["nodes"],
): ResolvedEdge | undefined {
  const outgoing = edges.filter((e) => e.from === currentNodeId);

  if (outgoing.length === 0) return undefined;

  // Use the first outgoing edge (standard or conditional)
  const edge = outgoing[0];

  if (edge.type === "standard") {
    return { nextNodeId: edge.to, edgeType: "standard" };
  }

  // conditional
  const conditionResult = evaluateOperator(
    state[edge.condition.field],
    edge.condition.operator,
    edge.condition.value,
  );
  const loopbackTarget = conditionResult ? edge.routes.true : edge.routes.false;

  // Check if this is a loopback (the target has already been visited, i.e. it's "behind" us).
  // We track retries whenever maxRetries is defined on this edge.
  if (edge.maxRetries !== undefined) {
    const retryKey = `${edge.from}:${loopbackTarget}`;
    const retries = (state.__retries__ as Record<string, number> | undefined) ?? {};
    const count = retries[retryKey] ?? 0;

    if (count >= edge.maxRetries) {
      // Exhausted — route to onExhausted
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

    // Increment counter
    state.__retries__ = { ...retries, [retryKey]: count + 1 };
  }

  return { nextNodeId: loopbackTarget, edgeType: "conditional", conditionResult };
}
