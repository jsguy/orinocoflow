import { z } from "zod";

// ─── Node schemas ────────────────────────────────────────────────────────────

export const WorkflowNodeSchema = z.object({
  id: z.string(),
  type: z.string(),
}).passthrough();

export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;

// ─── Edge schemas ─────────────────────────────────────────────────────────────

export const StandardEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  type: z.literal("standard"),
});

export const ConditionalEdgeSchema = z.object({
  from: z.string(),
  type: z.literal("conditional"),
  condition: z.object({
    field: z.string(),
    operator: z.string(),
    value: z.unknown(),
  }),
  routes: z.object({
    true: z.string(),
    false: z.string(),
  }),
  maxRetries: z.number().int().nonnegative().optional(),
  onExhausted: z.string().optional(),
});

export const ParallelEdgeSchema = z.object({
  from: z.string(),
  type: z.literal("parallel"),
  targets: z.array(z.string()).min(2),
  join: z.string(),
});

export const EdgeSchema = z.discriminatedUnion("type", [
  StandardEdgeSchema,
  ConditionalEdgeSchema,
  ParallelEdgeSchema,
]);

export type StandardEdge = z.infer<typeof StandardEdgeSchema>;
export type ConditionalEdge = z.infer<typeof ConditionalEdgeSchema>;
export type ParallelEdge = z.infer<typeof ParallelEdgeSchema>;
export type Edge = z.infer<typeof EdgeSchema>;

// ─── Workflow schema ──────────────────────────────────────────────────────────

export const WorkflowSchema = z.object({
  orinocoflow_version: z.string().optional(),
  graph_id: z.string(),
  entry_point: z.string(),
  nodes: z.array(WorkflowNodeSchema),
  edges: z.array(EdgeSchema),
});

export type Workflow = z.infer<typeof WorkflowSchema>;

export function parse(raw: unknown): Workflow {
  return WorkflowSchema.parse(raw);
}

// ─── NodeSpec schema ──────────────────────────────────────────────────────────

const NodeSpecFieldSchema = z.object({
  type: z.string().optional(),
  required: z.boolean().optional(),
  description: z.string().optional(),
});

const NodeSpecIOSchema = z.object({
  name: z.string(),
  type: z.string().optional(),
  description: z.string().optional(),
});

const NodeSpecInputSchema = NodeSpecIOSchema.extend({
  required: z.boolean().optional(),
});

export const NodeSpecSchema = z.object({
  node_type: z.string(),
  description: z.string().optional(),
  config: z.record(NodeSpecFieldSchema).optional(),
  inputs: z.array(NodeSpecInputSchema).optional(),
  outputs: z.array(NodeSpecIOSchema).optional(),
});

export type NodeSpec = z.infer<typeof NodeSpecSchema>;

export function parseNodeSpec(raw: unknown): NodeSpec {
  return NodeSpecSchema.parse(raw);
}

// ─── WorkflowState ───────────────────────────────────────────────────────────

export type WorkflowState = Record<string, unknown>;

// ─── WorkflowEvent ───────────────────────────────────────────────────────────

export type WorkflowEvent =
  | { type: "workflow_start"; workflowId: string; entryPoint: string }
  | { type: "node_start"; nodeId: string; nodeType: string; state: WorkflowState }
  | { type: "node_complete"; nodeId: string; nodeType: string; state: WorkflowState; durationMs: number }
  | { type: "edge_taken"; from: string; to: string; edgeType: "standard" | "conditional"; conditionResult?: boolean; retriesExhausted?: boolean; onExhausted?: string }
  | {
      type: "parallel_fork";
      from: string;
      targets: string[];
      join: string;
    }
  | { type: "parallel_join"; from: string; join: string; targets: string[] }
  | { type: "parallel_branch_error"; branchEntry: string; join: string; error: Error }
  | { type: "workflow_complete"; finalState: WorkflowState; durationMs: number }
  | { type: "workflow_suspended"; nodeId: string }
  | { type: "workflow_resume" }
  | { type: "error"; nodeId?: string; error: Error };

// ─── Suspend / Resume types ───────────────────────────────────────────────────

/**
 * The last single-edge transition that led into the node where execution suspended.
 * Uses unprefixed workflow-local node ids (same namespace as `suspendedAtNodeId`).
 */
export interface EnteredViaEdge {
  from: string;
  to: string;
  edgeType: "standard" | "conditional";
  conditionResult?: boolean;
  retriesExhausted?: boolean;
  onExhausted?: string;
}

export interface SuspendedExecution<S = WorkflowState> {
  workflowId: string;
  suspendedAtNodeId: string;
  state: S;
  workflowSnapshot: Workflow;
  /**
   * How execution reached this interrupt — mirrors the `edge_taken` event into `suspendedAtNodeId`.
   * Omitted when the interrupt is the workflow entry point (no prior edge in this run).
   */
  enteredViaEdge?: EnteredViaEdge;
}

export type WorkflowResult<S = WorkflowState> =
  | { status: "completed"; state: S; trace: WorkflowEvent[] }
  | { status: "suspended"; snapshot: SuspendedExecution<S>; trace: WorkflowEvent[] };
