import type { Workflow, Edge, ConditionalEdge } from "../schemas.js";

type AdjList = Map<string, Edge[]>;

function buildAdjList(edges: Edge[]): AdjList {
  const adj: AdjList = new Map();
  for (const edge of edges) {
    if (!adj.has(edge.from)) adj.set(edge.from, []);
    adj.get(edge.from)!.push(edge);
  }
  return adj;
}

function formatCondition(edge: ConditionalEdge): string {
  const { field, operator, value } = edge.condition;
  return `${field} ${operator} ${JSON.stringify(value)}`;
}

function formatConditionFalse(edge: ConditionalEdge): string {
  const { field, operator, value } = edge.condition;
  // For boolean === / !==, flip the value for readability
  if (operator === "===" && typeof value === "boolean") return `${field} === ${JSON.stringify(!value)}`;
  if (operator === "!==" && typeof value === "boolean") return `${field} !== ${JSON.stringify(!value)}`;
  // Otherwise negate the operator
  const negOp: Record<string, string> = { "===": "!==", "!==": "===", "<": ">=", ">": "<=", "<=": ">", ">=": "<" };
  return `${field} ${negOp[operator] ?? `!(${operator})`} ${JSON.stringify(value)}`;
}

function dfs(
  nodeId: string,
  adj: AdjList,
  ancestors: Set<string>,
  rendered: Set<string>,
  prefix: string,
  lines: string[],
): void {
  ancestors.add(nodeId);
  rendered.add(nodeId);

  const outgoing = adj.get(nodeId) ?? [];

  for (let i = 0; i < outgoing.length; i++) {
    const edge = outgoing[i];
    const isLast = i === outgoing.length - 1;
    const connector = isLast ? "└──" : "├──";
    const continuation = isLast ? "   " : "│  ";

    if (edge.type === "standard") {
      const target = edge.to;
      let label = target;
      if (ancestors.has(target)) {
        label += " (loop)";
        lines.push(`${prefix}${connector}> ${label}`);
      } else if (rendered.has(target)) {
        label += " (visited)";
        lines.push(`${prefix}${connector}> ${label}`);
      } else {
        lines.push(`${prefix}${connector}> ${target}`);
        dfs(target, adj, ancestors, rendered, prefix + continuation + "  ", lines);
      }
    } else {
      // conditional — emit two branches: true then false
      const cond = edge as ConditionalEdge;
      const condStr = formatCondition(cond);
      const retryStr = cond.maxRetries !== undefined
        ? `  (retry: ${cond.maxRetries}, exhausted: ${cond.onExhausted})`
        : "";

      const branches: Array<{ label: string; target: string; extra: string }> = [
        { label: `[${condStr}]`, target: cond.routes.true, extra: "" },
        { label: `[${formatConditionFalse(cond)}]`, target: cond.routes.false, extra: retryStr },
      ];

      // Recompute isLast within the two sub-branches
      for (let b = 0; b < branches.length; b++) {
        const { label, target, extra } = branches[b];
        const bIsLast = isLast && b === branches.length - 1;
        const bConnector = bIsLast ? "└──" : "├──";
        const bContinuation = bIsLast ? "   " : "│  ";

        let targetLabel = target + extra;
        if (ancestors.has(target)) {
          targetLabel = target + " (loop)" + extra;
          lines.push(`${prefix}${bConnector}${label}──> ${targetLabel}`);
        } else if (rendered.has(target)) {
          targetLabel = target + " (visited)" + extra;
          lines.push(`${prefix}${bConnector}${label}──> ${targetLabel}`);
        } else {
          lines.push(`${prefix}${bConnector}${label}──> ${target}${extra}`);
          dfs(target, adj, ancestors, rendered, prefix + bContinuation + "  ", lines);
        }
      }
    }
  }

  ancestors.delete(nodeId);
}

export function renderViz(workflow: Workflow): string {
  const adj = buildAdjList(workflow.edges);
  const ancestors = new Set<string>();
  const rendered = new Set<string>();
  const lines: string[] = [];

  lines.push(workflow.entry_point);
  dfs(workflow.entry_point, adj, ancestors, rendered, "  ", lines);

  return lines.join("\n");
}
