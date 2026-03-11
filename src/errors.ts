export class NodeNotFoundError extends Error {
  constructor(public readonly nodeId: string) {
    super(`Node not found: "${nodeId}"`);
    this.name = "NodeNotFoundError";
  }
}

export class HandlerError extends Error {
  constructor(
    public readonly nodeId: string,
    cause: unknown,
  ) {
    super(
      `Handler failed for node "${nodeId}": ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    this.name = "HandlerError";
    this.cause = cause;
  }
}

export class WorkflowCycleError extends Error {
  constructor(public readonly maxSteps: number) {
    super(`Workflow exceeded maxSteps limit of ${maxSteps}. Possible cycle detected.`);
    this.name = "WorkflowCycleError";
  }
}

export class WorkflowAbortedError extends Error {
  constructor() {
    super("Workflow execution was aborted.");
    this.name = "WorkflowAbortedError";
  }
}

export class InvalidEdgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidEdgeError";
  }
}

export class SubWorkflowNotFoundError extends Error {
  constructor(public readonly workflowId: string) {
    super(`Sub-workflow not found in registry: "${workflowId}"`);
    this.name = "SubWorkflowNotFoundError";
  }
}
