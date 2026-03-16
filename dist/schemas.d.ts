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
}>]>;
export type StandardEdge = z.infer<typeof StandardEdgeSchema>;
export type ConditionalEdge = z.infer<typeof ConditionalEdgeSchema>;
export type Edge = z.infer<typeof EdgeSchema>;
export declare const WorkflowSchema: z.ZodObject<{
    version: z.ZodLiteral<"1.0">;
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
    }>]>, "many">;
}, "strip", z.ZodTypeAny, {
    version: "1.0";
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
    })[];
}, {
    version: "1.0";
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
    })[];
}>;
export type Workflow = z.infer<typeof WorkflowSchema>;
export declare function parse(raw: unknown): Workflow;
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
export interface SuspendedExecution<S = WorkflowState> {
    workflowId: string;
    suspendedAtNodeId: string;
    state: S;
    workflowSnapshot: Workflow;
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
