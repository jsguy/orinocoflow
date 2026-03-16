import type { Workflow, WorkflowState, WorkflowNode } from "../schemas.js";
interface MockData {
    handlers: Record<string, Record<string, unknown>>;
}
export declare function buildMockHandlers(mockData: MockData, workflow: Workflow): Record<string, (node: WorkflowNode, state: WorkflowState) => Promise<WorkflowState>>;
export declare function runSimulation(workflow: Workflow, mockFilePath: string): Promise<void>;
export {};
