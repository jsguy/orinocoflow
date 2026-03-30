import type { Edge, ParallelEdge, StandardEdge, Workflow, WorkflowNode } from "./schemas.js";
import { WorkflowConfigurationError } from "./errors.js";

function nodeById(workflow: Workflow, id: string): WorkflowNode | undefined {
  return workflow.nodes.find((n) => n.id === id);
}

/**
 * Collect node ids that run as part of a parallel branch from `target` to `join` (exclusive of `join`).
 * Each step must be exactly one standard edge; no conditionals or nested parallel.
 */
export function collectParallelBranchNodes(workflow: Workflow, target: string, join: string): string[] {
  if (target === join) {
    throw new WorkflowConfigurationError(
      `Parallel branch target cannot be the join node "${join}" (zero-hop branches are not allowed).`,
    );
  }

  const visited: string[] = [];
  let cur = target;

  for (;;) {
    visited.push(cur);
    const outgoing = workflow.edges.filter((e) => e.from === cur);
    if (outgoing.length !== 1) {
      throw new WorkflowConfigurationError(
        `Parallel branch from "${target}" invalid at "${cur}": expected exactly one outgoing edge toward join "${join}".`,
      );
    }
    const e = outgoing[0];
    if (e.type === "parallel") {
      throw new WorkflowConfigurationError(
        `Nested parallel from "${cur}" is not allowed inside a parallel branch (simple tier).`,
      );
    }
    if (e.type === "conditional") {
      throw new WorkflowConfigurationError(
        `Conditional edge from "${cur}" is not allowed inside a parallel branch (simple tier).`,
      );
    }
    if (e.type !== "standard") {
      throw new WorkflowConfigurationError(`Parallel branch from "${target}" has non-standard edge from "${cur}".`);
    }
    if (e.to === join) {
      return visited;
    }
    if (visited.includes(e.to)) {
      throw new WorkflowConfigurationError(`Parallel branch from "${target}" contains a cycle at "${e.to}".`);
    }
    cur = e.to;
  }
}

function assertNoInterruptOrSubworkflow(workflow: Workflow, nodeIds: string[], context: string): void {
  for (const id of nodeIds) {
    const n = nodeById(workflow, id);
    if (!n) continue;
    if (n.type === "interrupt") {
      throw new WorkflowConfigurationError(
        `Node "${id}" (${context}) cannot be an interrupt inside a parallel branch (v1).`,
      );
    }
    if (n.type === "sub_workflow") {
      throw new WorkflowConfigurationError(
        `Node "${id}" (${context}) cannot be a sub_workflow inside a parallel branch (v1).`,
      );
    }
  }
}

/**
 * Validate workflow structure for parallel regions (simple tier) and global single-outgoing rule.
 */
export function validateParallelWorkflow(workflow: Workflow): void {
  const nodeIds = new Set(workflow.nodes.map((n) => n.id));

  const byFrom = new Map<string, Edge[]>();
  for (const e of workflow.edges) {
    if (!byFrom.has(e.from)) byFrom.set(e.from, []);
    byFrom.get(e.from)!.push(e);
  }
  for (const [from, list] of byFrom) {
    if (list.length > 1) {
      throw new WorkflowConfigurationError(
        `Node "${from}" has ${list.length} outgoing edges; exactly one is required.`,
      );
    }
  }

  const parallelEdges = workflow.edges.filter((e): e is ParallelEdge => e.type === "parallel");
  const joinUsedBy = new Map<string, ParallelEdge>();

  for (const pe of parallelEdges) {
    if (joinUsedBy.has(pe.join)) {
      throw new WorkflowConfigurationError(
        `Join node "${pe.join}" is referenced by more than one parallel edge; each join must be unique.`,
      );
    }
    joinUsedBy.set(pe.join, pe);

    if (!nodeIds.has(pe.from)) {
      throw new WorkflowConfigurationError(`Parallel edge from unknown node "${pe.from}".`);
    }
    if (!nodeIds.has(pe.join)) {
      throw new WorkflowConfigurationError(`Parallel edge references unknown join node "${pe.join}".`);
    }

    const tset = new Set(pe.targets);
    if (tset.size !== pe.targets.length) {
      throw new WorkflowConfigurationError(`Parallel edge from "${pe.from}" has duplicate targets.`);
    }
    for (const t of pe.targets) {
      if (!nodeIds.has(t)) {
        throw new WorkflowConfigurationError(`Parallel edge from "${pe.from}" references unknown target "${t}".`);
      }
      if (t === pe.join) {
        throw new WorkflowConfigurationError(`Parallel target cannot equal join "${pe.join}".`);
      }
    }

    const branchChains: string[][] = [];
    const allBranchNodes = new Set<string>();

    for (const target of pe.targets) {
      const chain = collectParallelBranchNodes(workflow, target, pe.join);
      assertNoInterruptOrSubworkflow(workflow, chain, `parallel branch from "${target}"`);
      for (const id of chain) {
        if (allBranchNodes.has(id)) {
          throw new WorkflowConfigurationError(
            `Parallel branches from "${pe.from}" overlap at node "${id}"; branches must be disjoint (simple tier).`,
          );
        }
        allBranchNodes.add(id);
      }
      branchChains.push(chain);
    }

    const preds = new Set<string>();
    for (const chain of branchChains) {
      const last = chain[chain.length - 1];
      preds.add(last);
    }

    const intoJoin = workflow.edges.filter(
      (e): e is StandardEdge => e.type === "standard" && e.to === pe.join,
    );
    const fromIncoming = new Set(intoJoin.map((e) => e.from));

    if (intoJoin.length !== preds.size || ![...preds].every((p) => fromIncoming.has(p))) {
      throw new WorkflowConfigurationError(
        `Join "${pe.join}" may only be entered via standard edges from parallel branch tips [${[...preds].sort().join(", ")}]; ` +
          `found edges from [${[...fromIncoming].sort().join(", ")}]. No shortcuts or extra ingress.`,
      );
    }
  }
}
