export declare class NodeNotFoundError extends Error {
    readonly nodeId: string;
    constructor(nodeId: string);
}
export declare class HandlerError extends Error {
    readonly nodeId: string;
    constructor(nodeId: string, cause: unknown);
}
export declare class WorkflowCycleError extends Error {
    readonly maxSteps: number;
    constructor(maxSteps: number);
}
export declare class WorkflowAbortedError extends Error {
    constructor();
}
export declare class InvalidEdgeError extends Error {
    constructor(message: string);
}
export declare class SubWorkflowNotFoundError extends Error {
    readonly workflowId: string;
    constructor(workflowId: string);
}
export declare class WorkflowConfigurationError extends Error {
    constructor(message: string);
}
