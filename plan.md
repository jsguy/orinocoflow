### Minimalist TypeScript Workflow Engine

This library provides a lightweight, forward-compatible execution engine for AI workflows defined via JSON. It uses Zod to validate schemas and guarantees backwards compatibility by migrating older JSON versions into the latest runtime structure in-memory before execution.

#### 1. Schema Validation & Versioning (Zod)

The engine intercepts incoming JSON payloads, checks the version, and applies defaults to ensure older schemas (e.g., `v1.0`) can run on the latest engine (e.g., `v2.0`).

```typescript
import { z } from "zod";

// --- V1 Schema (Legacy) ---
const EdgeV1 = z.object({
  from: z.string(),
  to: z.string(),
  type: z.enum(["standard", "conditional"]).optional()
});

const WorkflowV1 = z.object({
  version: z.literal("1.0"),
  graph_id: z.string(),
  entry_point: z.string(),
  nodes: z.array(z.any()), 
  edges: z.array(EdgeV1)
});

// --- V2 Schema (Current Engine) ---
const EdgeV2 = z.object({
  from: z.string(),
  to: z.string(),
  type: z.enum(["standard", "conditional"]), 
  condition: z.any().optional(),
  routes: z.any().optional(),
  timeout_ms: z.number().default(5000)       
});

const WorkflowV2 = z.object({
  version: z.literal("2.0"),
  graph_id: z.string(),
  entry_point: z.string(),
  nodes: z.array(z.any()),
  edges: z.array(EdgeV2)
});

type CompleteWorkflow = z.infer<typeof WorkflowV2>;

// --- The Upcaster ---
export function parseAndMigrate(jsonPayload: any): CompleteWorkflow {
  if (jsonPayload.version === "1.0") {
    const parsedV1 = WorkflowV1.parse(jsonPayload);
    return {
      version: "2.0",
      graph_id: parsedV1.graph_id,
      entry_point: parsedV1.entry_point,
      nodes: parsedV1.nodes,
      edges: parsedV1.edges.map(e => ({
        from: e.from,
        to: e.to,
        type: e.type || "standard", 
        timeout_ms: 5000            
      }))
    };
  }
  return WorkflowV2.parse(jsonPayload);
}

```

#### 2. The Core Execution Loop

Once the schema is parsed and upcasted to the current version, the runner iterates through the nodes, mutates the state, and handles standard or conditional routing.

```typescript
export async function runWorkflow(workflow: CompleteWorkflow, initialState: Record<string, any>) {
  let currentState = { ...initialState };
  let currentNodeId: string | undefined = workflow.entry_point;

  while (currentNodeId) {
    // 1. Find and execute the current node
    const node = workflow.nodes.find(n => n.id === currentNodeId);
    if (!node) throw new Error(`Node ${currentNodeId} not found`);
    
    currentState = await executeNodeHandler(node, currentState); // Your custom runner logic

    // 2. Find outgoing edges
    const edges = workflow.edges.filter(e => e.from === currentNodeId);
    if (edges.length === 0) break; // Execution complete

    // 3. Evaluate Routing (simplified for single outbound edge logic)
    const edge = edges[0]; 
    if (edge.type === "conditional" && edge.condition) {
       const value = currentState[edge.condition.field];
       // Evaluate based on operator (e.g., "<", ">", "===")
       const passed = evaluateOperator(value, edge.condition.operator, edge.condition.value);
       currentNodeId = passed ? edge.routes.true : edge.routes.false;
    } else {
       currentNodeId = edge.to; // Standard routing
    }
  }
  
  return currentState;
}

```

#### 3. Full JSON Definitions (v1.0 Example)

These are the JSON payloads passed into the `parseAndMigrate` function.

**Main Workflow (`pr_pipeline_01.json`)**

```json
{
  "version": "1.0",
  "graph_id": "pr_pipeline_01",
  "entry_point": "read_email",
  "nodes": [
    { "id": "read_email", "type": "integration", "action": "imap_fetch" },
    { "id": "draft_content", "type": "llm", "model": "gpt-4" },
    { "id": "human_review", "type": "human_task" },
    { "id": "generate_image", "type": "llm_image" },
    { "id": "review_context_step", "type": "sub_workflow", "workflow_id": "review_context_01" },
    { "id": "publish_story", "type": "local_script", "script_path": "./publish.sh" }
  ],
  "edges": [
    { "from": "read_email", "to": "draft_content", "type": "standard" },
    {
      "from": "draft_content",
      "type": "conditional",
      "condition": { "field": "confidence_score", "operator": "<", "value": 75 },
      "routes": { "true": "human_review", "false": "generate_image" }
    },
    { "from": "human_review", "to": "generate_image", "type": "standard" },
    { "from": "generate_image", "to": "review_context_step", "type": "standard" },
    { "from": "review_context_step", "to": "publish_story", "type": "standard" }
  ]
}

```

**Sub-Workflow (`review_context_01.json`)**

```json
{
  "version": "1.0",
  "graph_id": "review_context_01",
  "entry_point": "editorial_check",
  "nodes": [
    { "id": "editorial_check", "type": "llm_evaluator" },
    { "id": "format_html", "type": "data_transform" }
  ],
  "edges": [
    { "from": "editorial_check", "to": "format_html", "type": "standard" }
  ]
}

```

