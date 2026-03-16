import { readFile } from "node:fs/promises";
import { parse as yamlParse } from "yaml";
import { runWorkflow } from "../execute.js";
import type { Workflow, WorkflowState, WorkflowEvent, WorkflowNode } from "../schemas.js";

interface MockData {
  handlers: Record<string, Record<string, unknown>>;
}

function loadMockData(content: string, path: string): MockData {
  const ext = path.split(".").pop()?.toLowerCase();
  return ext === "json" ? JSON.parse(content) : yamlParse(content);
}

export function buildMockHandlers(
  mockData: MockData,
  workflow: Workflow,
): Record<string, (node: WorkflowNode, state: WorkflowState) => Promise<WorkflowState>> {
  const counts: Record<string, number> = {};

  function makeHandler(nodeId: string) {
    return async (_node: WorkflowNode, state: WorkflowState): Promise<WorkflowState> => {
      counts[nodeId] = (counts[nodeId] ?? 0) + 1;
      const count = counts[nodeId];
      const key = count > 1 ? `${nodeId}.${count}` : nodeId;
      const entry = mockData.handlers[key] ?? mockData.handlers[nodeId] ?? {};
      return { ...state, ...entry };
    };
  }

  const handlers: Record<string, ReturnType<typeof makeHandler>> = {};
  for (const node of workflow.nodes) {
    const h = makeHandler(node.id);
    handlers[node.id] = h;
    if (node.type !== node.id) handlers[node.type] = h;
  }
  return handlers;
}

function filterState(state: WorkflowState): WorkflowState {
  const { __retries__: _, ...rest } = state as Record<string, unknown>;
  return rest;
}

export async function runSimulation(
  workflow: Workflow,
  mockFilePath: string,
): Promise<void> {
  const content = await readFile(mockFilePath, "utf8");
  const mockData = loadMockData(content, mockFilePath);
  const handlers = buildMockHandlers(mockData, workflow);

  console.log(`Simulating: ${workflow.graph_id}`);
  console.log(`Mock data: ${mockFilePath}`);
  console.log("");

  let step = 0;
  const nodeCounts: Record<string, number> = {};
  const path: string[] = [];

  const colW = 12;

  function pad(s: string, w: number): string {
    return s.length >= w ? s : s + " ".repeat(w - s.length);
  }

  const events: WorkflowEvent[] = [];

  await runWorkflow(workflow, {}, {
    handlers,
    onEvent: (event) => { events.push(event); },
  });

  for (let i = 0; i < events.length; i++) {
    const event = events[i];

    if (event.type === "node_complete") {
      step++;
      nodeCounts[event.nodeId] = (nodeCounts[event.nodeId] ?? 0) + 1;
      const count = nodeCounts[event.nodeId];
      const label = count > 1 ? `${event.nodeId} (x${count})` : event.nodeId;
      path.push(event.nodeId);
      const stateStr = JSON.stringify(filterState(event.state));
      console.log(`Step ${step} │ ${pad(label, colW)} │ state: ${stateStr}`);
    }

    if (event.type === "edge_taken") {
      const blank = " ".repeat(`Step ${step}`.length);
      const nodeBlank = pad("", colW);

      if (event.edgeType === "conditional") {
        // Find the edge to get condition details
        const edge = workflow.edges.find(
          (e) => e.type === "conditional" && e.from === event.from.split("/").pop(),
        );
        if (edge?.type === "conditional") {
          const { field, operator, value } = edge.condition;
          const result = event.conditionResult;
          if (event.retriesExhausted) {
            console.log(`${blank} │ ${nodeBlank} │ edge: ${field} ${operator} ${JSON.stringify(value)} → ${result}, retries exhausted → ${event.to}`);
          } else {
            // Detect retry by checking if next node_complete is same nodeId eventually
            const nextStep = events.slice(i + 1).find((e) => e.type === "node_complete");
            const retryCount = nodeCounts[event.from.split("/").pop()!] ?? 0;
            const maxRetries = edge.maxRetries;
            if (maxRetries !== undefined && !result) {
              console.log(`${blank} │ ${nodeBlank} │ edge: ${field} ${operator} ${JSON.stringify(value)} → ${result}, retry ${retryCount}/${maxRetries} → ${event.to}`);
            } else {
              console.log(`${blank} │ ${nodeBlank} │ edge: ${field} ${operator} ${JSON.stringify(value)} → ${event.to}`);
            }
          }
        }
      } else {
        const blank2 = " ".repeat(`Step ${step}`.length);
        console.log(`${blank2} │ ${nodeBlank} │ edge: → ${event.to}`);
      }
    }
  }

  console.log("");
  console.log(`✓ Completed in ${step} steps`);
  console.log(`Path: ${path.join(" → ")}`);
}
