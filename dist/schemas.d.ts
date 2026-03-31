import { z } from "zod";
export declare const WorkflowNodeSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodString;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    id: z.ZodString;
    type: z.ZodString;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    id: z.ZodString;
    type: z.ZodString;
}, z.ZodTypeAny, "passthrough">>;
export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;
export declare const StandardEdgeSchema: z.ZodObject<{
    from: z.ZodString;
    to: z.ZodString;
    type: z.ZodLiteral<"standard">;
}, "strip", z.ZodTypeAny, {
    type: "standard";
    from: string;
    to: string;
}, {
    type: "standard";
    from: string;
    to: string;
}>;
export declare const ConditionalEdgeSchema: z.ZodObject<{
    from: z.ZodString;
    type: z.ZodLiteral<"conditional">;
    condition: z.ZodObject<{
        field: z.ZodString;
        operator: z.ZodString;
        value: z.ZodUnknown;
    }, "strip", z.ZodTypeAny, {
        field: string;
        operator: string;
        value?: unknown;
    }, {
        field: string;
        operator: string;
        value?: unknown;
    }>;
    routes: z.ZodObject<{
        true: z.ZodString;
        false: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        true: string;
        false: string;
    }, {
        true: string;
        false: string;
    }>;
    maxRetries: z.ZodOptional<z.ZodNumber>;
    onExhausted: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "conditional";
    from: string;
    condition: {
        field: string;
        operator: string;
        value?: unknown;
    };
    routes: {
        true: string;
        false: string;
    };
    maxRetries?: number | undefined;
    onExhausted?: string | undefined;
}, {
    type: "conditional";
    from: string;
    condition: {
        field: string;
        operator: string;
        value?: unknown;
    };
    routes: {
        true: string;
        false: string;
    };
    maxRetries?: number | undefined;
    onExhausted?: string | undefined;
}>;
export declare const ParallelEdgeSchema: z.ZodObject<{
    from: z.ZodString;
    type: z.ZodLiteral<"parallel">;
    targets: z.ZodArray<z.ZodString, "many">;
    join: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "parallel";
    join: string;
    from: string;
    targets: string[];
}, {
    type: "parallel";
    join: string;
    from: string;
    targets: string[];
}>;
export declare const EdgeSchema: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
    from: z.ZodString;
    to: z.ZodString;
    type: z.ZodLiteral<"standard">;
}, "strip", z.ZodTypeAny, {
    type: "standard";
    from: string;
    to: string;
}, {
    type: "standard";
    from: string;
    to: string;
}>, z.ZodObject<{
    from: z.ZodString;
    type: z.ZodLiteral<"conditional">;
    condition: z.ZodObject<{
        field: z.ZodString;
        operator: z.ZodString;
        value: z.ZodUnknown;
    }, "strip", z.ZodTypeAny, {
        field: string;
        operator: string;
        value?: unknown;
    }, {
        field: string;
        operator: string;
        value?: unknown;
    }>;
    routes: z.ZodObject<{
        true: z.ZodString;
        false: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        true: string;
        false: string;
    }, {
        true: string;
        false: string;
    }>;
    maxRetries: z.ZodOptional<z.ZodNumber>;
    onExhausted: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "conditional";
    from: string;
    condition: {
        field: string;
        operator: string;
        value?: unknown;
    };
    routes: {
        true: string;
        false: string;
    };
    maxRetries?: number | undefined;
    onExhausted?: string | undefined;
}, {
    type: "conditional";
    from: string;
    condition: {
        field: string;
        operator: string;
        value?: unknown;
    };
    routes: {
        true: string;
        false: string;
    };
    maxRetries?: number | undefined;
    onExhausted?: string | undefined;
}>, z.ZodObject<{
    from: z.ZodString;
    type: z.ZodLiteral<"parallel">;
    targets: z.ZodArray<z.ZodString, "many">;
    join: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "parallel";
    join: string;
    from: string;
    targets: string[];
}, {
    type: "parallel";
    join: string;
    from: string;
    targets: string[];
}>]>;
export type StandardEdge = z.infer<typeof StandardEdgeSchema>;
export type ConditionalEdge = z.infer<typeof ConditionalEdgeSchema>;
export type ParallelEdge = z.infer<typeof ParallelEdgeSchema>;
export type Edge = z.infer<typeof EdgeSchema>;
export declare const WorkflowSchema: z.ZodObject<{
    orinocoflow_version: z.ZodOptional<z.ZodString>;
    graph_id: z.ZodString;
    entry_point: z.ZodString;
    nodes: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        id: z.ZodString;
        type: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        id: z.ZodString;
        type: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>, "many">;
    edges: z.ZodArray<z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
        from: z.ZodString;
        to: z.ZodString;
        type: z.ZodLiteral<"standard">;
    }, "strip", z.ZodTypeAny, {
        type: "standard";
        from: string;
        to: string;
    }, {
        type: "standard";
        from: string;
        to: string;
    }>, z.ZodObject<{
        from: z.ZodString;
        type: z.ZodLiteral<"conditional">;
        condition: z.ZodObject<{
            field: z.ZodString;
            operator: z.ZodString;
            value: z.ZodUnknown;
        }, "strip", z.ZodTypeAny, {
            field: string;
            operator: string;
            value?: unknown;
        }, {
            field: string;
            operator: string;
            value?: unknown;
        }>;
        routes: z.ZodObject<{
            true: z.ZodString;
            false: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            true: string;
            false: string;
        }, {
            true: string;
            false: string;
        }>;
        maxRetries: z.ZodOptional<z.ZodNumber>;
        onExhausted: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type: "conditional";
        from: string;
        condition: {
            field: string;
            operator: string;
            value?: unknown;
        };
        routes: {
            true: string;
            false: string;
        };
        maxRetries?: number | undefined;
        onExhausted?: string | undefined;
    }, {
        type: "conditional";
        from: string;
        condition: {
            field: string;
            operator: string;
            value?: unknown;
        };
        routes: {
            true: string;
            false: string;
        };
        maxRetries?: number | undefined;
        onExhausted?: string | undefined;
    }>, z.ZodObject<{
        from: z.ZodString;
        type: z.ZodLiteral<"parallel">;
        targets: z.ZodArray<z.ZodString, "many">;
        join: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: "parallel";
        join: string;
        from: string;
        targets: string[];
    }, {
        type: "parallel";
        join: string;
        from: string;
        targets: string[];
    }>]>, "many">;
}, "strip", z.ZodTypeAny, {
    graph_id: string;
    entry_point: string;
    nodes: z.objectOutputType<{
        id: z.ZodString;
        type: z.ZodString;
    }, z.ZodTypeAny, "passthrough">[];
    edges: ({
        type: "standard";
        from: string;
        to: string;
    } | {
        type: "conditional";
        from: string;
        condition: {
            field: string;
            operator: string;
            value?: unknown;
        };
        routes: {
            true: string;
            false: string;
        };
        maxRetries?: number | undefined;
        onExhausted?: string | undefined;
    } | {
        type: "parallel";
        join: string;
        from: string;
        targets: string[];
    })[];
    orinocoflow_version?: string | undefined;
}, {
    graph_id: string;
    entry_point: string;
    nodes: z.objectInputType<{
        id: z.ZodString;
        type: z.ZodString;
    }, z.ZodTypeAny, "passthrough">[];
    edges: ({
        type: "standard";
        from: string;
        to: string;
    } | {
        type: "conditional";
        from: string;
        condition: {
            field: string;
            operator: string;
            value?: unknown;
        };
        routes: {
            true: string;
            false: string;
        };
        maxRetries?: number | undefined;
        onExhausted?: string | undefined;
    } | {
        type: "parallel";
        join: string;
        from: string;
        targets: string[];
    })[];
    orinocoflow_version?: string | undefined;
}>;
export type Workflow = z.infer<typeof WorkflowSchema>;
export declare function parse(raw: unknown): Workflow;
export declare const NodeSpecSchema: z.ZodObject<{
    node_type: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        type: z.ZodOptional<z.ZodString>;
        required: z.ZodOptional<z.ZodBoolean>;
        description: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type?: string | undefined;
        required?: boolean | undefined;
        description?: string | undefined;
    }, {
        type?: string | undefined;
        required?: boolean | undefined;
        description?: string | undefined;
    }>>>;
    inputs: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        type: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
    } & {
        required: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        type?: string | undefined;
        required?: boolean | undefined;
        description?: string | undefined;
    }, {
        name: string;
        type?: string | undefined;
        required?: boolean | undefined;
        description?: string | undefined;
    }>, "many">>;
    outputs: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        type: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        type?: string | undefined;
        description?: string | undefined;
    }, {
        name: string;
        type?: string | undefined;
        description?: string | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    node_type: string;
    description?: string | undefined;
    config?: Record<string, {
        type?: string | undefined;
        required?: boolean | undefined;
        description?: string | undefined;
    }> | undefined;
    inputs?: {
        name: string;
        type?: string | undefined;
        required?: boolean | undefined;
        description?: string | undefined;
    }[] | undefined;
    outputs?: {
        name: string;
        type?: string | undefined;
        description?: string | undefined;
    }[] | undefined;
}, {
    node_type: string;
    description?: string | undefined;
    config?: Record<string, {
        type?: string | undefined;
        required?: boolean | undefined;
        description?: string | undefined;
    }> | undefined;
    inputs?: {
        name: string;
        type?: string | undefined;
        required?: boolean | undefined;
        description?: string | undefined;
    }[] | undefined;
    outputs?: {
        name: string;
        type?: string | undefined;
        description?: string | undefined;
    }[] | undefined;
}>;
export type NodeSpec = z.infer<typeof NodeSpecSchema>;
export declare function parseNodeSpec(raw: unknown): NodeSpec;
export type WorkflowState = Record<string, unknown>;
export type WorkflowEvent = {
    type: "workflow_start";
    workflowId: string;
    entryPoint: string;
} | {
    type: "node_start";
    nodeId: string;
    nodeType: string;
    state: WorkflowState;
} | {
    type: "node_complete";
    nodeId: string;
    nodeType: string;
    state: WorkflowState;
    durationMs: number;
} | {
    type: "edge_taken";
    from: string;
    to: string;
    edgeType: "standard" | "conditional";
    conditionResult?: boolean;
    retriesExhausted?: boolean;
    onExhausted?: string;
} | {
    type: "parallel_fork";
    from: string;
    targets: string[];
    join: string;
} | {
    type: "parallel_join";
    from: string;
    join: string;
    targets: string[];
} | {
    type: "parallel_branch_error";
    branchEntry: string;
    join: string;
    error: Error;
} | {
    type: "workflow_complete";
    finalState: WorkflowState;
    durationMs: number;
} | {
    type: "workflow_suspended";
    nodeId: string;
} | {
    type: "workflow_resume";
} | {
    type: "error";
    nodeId?: string;
    error: Error;
};
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
export type WorkflowResult<S = WorkflowState> = {
    status: "completed";
    state: S;
    trace: WorkflowEvent[];
} | {
    status: "suspended";
    snapshot: SuspendedExecution<S>;
    trace: WorkflowEvent[];
};
