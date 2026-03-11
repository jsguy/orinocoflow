import type { Edge, WorkflowState } from "./schemas.js";
import { InvalidEdgeError } from "./errors.js";

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

/**
 * Given the outgoing edges from the current node and the current state,
 * return the next node ID (or undefined if terminal).
 */
export function resolveNextNode(
  currentNodeId: string,
  edges: Edge[],
  state: WorkflowState,
): { nextNodeId: string; edgeType: "standard" | "conditional"; conditionResult?: boolean } | undefined {
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
  const nextNodeId = conditionResult ? edge.routes.true : edge.routes.false;
  return { nextNodeId, edgeType: "conditional", conditionResult };
}
