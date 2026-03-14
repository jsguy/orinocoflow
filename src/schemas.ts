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

export const EdgeSchema = z.discriminatedUnion("type", [
  StandardEdgeSchema,
  ConditionalEdgeSchema,
]);

export type StandardEdge = z.infer<typeof StandardEdgeSchema>;
export type ConditionalEdge = z.infer<typeof ConditionalEdgeSchema>;
export type Edge = z.infer<typeof EdgeSchema>;

// ─── Workflow schema ──────────────────────────────────────────────────────────

export const WorkflowSchema = z.object({
  version: z.literal("1.0"),
  graph_id: z.string(),
  entry_point: z.string(),
  nodes: z.array(WorkflowNodeSchema),
  edges: z.array(EdgeSchema),
});

export type Workflow = z.infer<typeof WorkflowSchema>;

export function parse(raw: unknown): Workflow {
  return WorkflowSchema.parse(raw);
}

// ─── WorkflowState ───────────────────────────────────────────────────────────

export type WorkflowState = Record<string, unknown>;

// ─── WorkflowEvent ───────────────────────────────────────────────────────────

export type WorkflowEvent =
  | { type: "workflow_start"; workflowId: string; entryPoint: string }
  | { type: "node_start"; nodeId: string; nodeType: string; state: WorkflowState }
  | { type: "node_complete"; nodeId: string; nodeType: string; state: WorkflowState; durationMs: number }
  | { type: "edge_taken"; from: string; to: string; edgeType: "standard" | "conditional"; conditionResult?: boolean; retriesExhausted?: boolean; onExhausted?: string }
  | { type: "workflow_complete"; finalState: WorkflowState; durationMs: number }
  | { type: "workflow_suspended"; nodeId: string }
  | { type: "workflow_resume" }
  | { type: "error"; nodeId?: string; error: Error };

// ─── Suspend / Resume types ───────────────────────────────────────────────────

export interface SuspendedExecution<S = WorkflowState> {
  workflowId: string;
  suspendedAtNodeId: string;
  state: S;
  workflowSnapshot: Workflow;
}

export type WorkflowResult<S = WorkflowState> =
  | { status: "completed"; state: S; trace: WorkflowEvent[] }
  | { status: "suspended"; snapshot: SuspendedExecution<S>; trace: WorkflowEvent[] };
